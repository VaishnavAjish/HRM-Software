import { randomUUID } from 'node:crypto';

import {
  isScopeType,
  type AuthorizationDecision,
  type AuthorizeInput,
  type ConditionNode,
  type DecisionSource,
  type EffectiveState,
  type EvaluationContext,
  type Obligations,
  type ReasonCode,
  type ScopeType,
  type Subject,
} from './authorization.types.js';
import { ConditionEvaluator, InvalidConditionError } from './condition.evaluator.js';
import { ScopeMatcher } from './scope.matcher.js';

/**
 * The single place an authorization question is answered.
 *
 * Every enforcement point in the application — route guards, row filters,
 * field filters, the simulator and the permission matrix preview — calls
 * `decide()`. That is deliberate: the reference design promises the simulator
 * predicts what the API will do, and the only way to keep that promise is for
 * both to run the same code rather than two implementations that agree until
 * one of them is edited.
 *
 * Evaluation order, and why it is this order:
 *
 *   1. subject active        a disabled account is denied before any lookup
 *   2. tenant isolation      cross-tenant is denied before roles are read, so
 *                            no permission can ever grant across a tenant
 *   3. gather sources        direct grants, roles (+inheritance), delegations,
 *                            emergency grants
 *   4. gather policies       ABAC/PBAC, filtered by subject/action/resource
 *   5. explicit deny wins    any DENY beats every ALLOW
 *   6. otherwise allow       if at least one ALLOW survived its conditions
 *   7. default deny          no rule matched
 */

export interface RoleContext {
  roleId: number;
  roleCode: string;
  scopeType: string | null;
  scopeId: string | null;
  inherited: boolean;
}

export interface GrantRow {
  id: number;
  effect: 'ALLOW' | 'DENY';
  conditions: unknown;
  obligations: unknown;
}

export interface PolicyRow {
  id: number;
  code: string;
  effect: 'ALLOW' | 'DENY';
  subjects: unknown;
  actions: unknown;
  resources: unknown;
  scopeType: string | null;
  scopeId: string | null;
  conditions: unknown;
  obligations: unknown;
  priority: number;
}

export interface TemporaryGrantRow {
  id: number;
  type: 'DELEGATION' | 'EMERGENCY_ACCESS';
  permissionCodes: string[];
  scopeType: string | null;
  scopeId: string | null;
}

/**
 * Everything the engine needs from storage.
 *
 * An interface rather than a Prisma import so the decision logic can be
 * tested exhaustively against fixtures — the alternative is a test suite that
 * needs a live Postgres to assert that deny beats allow.
 */
export interface AuthorizationRepository {
  directGrants(userId: number, permissionCode: string): Promise<GrantRow[]>;
  roleContexts(userId: number): Promise<RoleContext[]>;
  rolePermissions(roleId: number, permissionCode: string, inheritedOnly: boolean): Promise<GrantRow[]>;
  policies(tenantId: string | null): Promise<PolicyRow[]>;
  temporaryGrants(userId: number): Promise<TemporaryGrantRow[]>;
  relationships(userId: number, resourceType: string, resourceId: string, tenantId: string | null): Promise<string[]>;
  hasGlobalAssignment(userId: number): Promise<boolean>;
  writeDecision(entry: DecisionLogEntry): Promise<void>;
}

export interface DecisionLogEntry {
  decisionId: string;
  tenantId: string | null;
  userId: number;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  decision: 'ALLOW' | 'DENY';
  reasonCode: string;
  matchedPolicyIds: number[];
  failedConditions: string[];
  scope: Record<string, unknown>;
  obligations: Obligations;
  changedFields: string[];
  businessReason: string | null;
  durationMs: number;
  sessionId: string | null;
  ipAddress: string | null;
  device: string | null;
  requestId: string | null;
}

export interface EngineRequestMeta {
  sessionId?: string | null;
  ipAddress?: string | null;
  device?: string | null;
  requestId?: string | null;
}

/** Human text per reason. Safe for a toast; never names a policy. */
const REASON_TEXT: Record<ReasonCode, string> = {
  EXPLICIT_ALLOW: 'All policy conditions matched',
  EXPLICIT_DENY: 'Access is explicitly denied for this action',
  PERMISSION_NOT_ASSIGNED: 'You are not permitted to perform this action',
  SUBJECT_DISABLED: 'This account is disabled',
  TENANT_ACCESS_DENIED: 'This record belongs to another company',
  AUTHENTICATION_REQUIRED: 'Authentication required',
  SCOPE_ACCESS_DENIED: 'This record is outside your assigned scope',
  SEPARATION_OF_DUTY_VIOLATION: 'This combination of access is not permitted',
  TEMPORARY_ACCESS_EXPIRED: 'Your temporary access has expired',
  INVALID_POLICY_CONDITION: 'A policy condition could not be evaluated',
};

/** Traversal cap for role inheritance, mirroring the PHP engine. */
const MAX_INHERITANCE_DEPTH = 8;

export class AuthorizationEngine {
  constructor(
    private readonly repo: AuthorizationRepository,
    private readonly conditions: ConditionEvaluator = new ConditionEvaluator(),
    private readonly scopes: ScopeMatcher = new ScopeMatcher(),
  ) {}

  async decide(input: AuthorizeInput, meta: EngineRequestMeta = {}): Promise<AuthorizationDecision> {
    const started = process.hrtime.bigint();
    const { subject, action } = input;
    const resource = input.resource ?? {};
    const requestContext = input.context ?? {};

    const tenantId = this.subjectTenant(subject);
    const resourceTenant = this.scopes.tenant(resource);
    const global = await this.isGlobalActor(subject);

    const finish = (
      allowed: boolean,
      reasonCode: ReasonCode,
      extras: Partial<AuthorizationDecision> = {},
    ): Promise<AuthorizationDecision> =>
      this.finish(subject, action, resource, started, meta, requestContext, {
        allowed,
        reasonCode,
        ...extras,
      });

    if (!this.isActive(subject)) {
      return finish(false, 'SUBJECT_DISABLED', { effectiveState: 'DENY' });
    }

    // Before roles, before permissions. A tenant breach must not be
    // reachable by holding the right permission.
    if (!this.scopes.tenantMatches(tenantId, resourceTenant, global)) {
      return finish(false, 'TENANT_ACCESS_DENIED', { effectiveState: 'DENY' });
    }

    const context = await this.buildContext(subject, resource, requestContext, action, tenantId);

    let sources: DecisionSource[];
    let policies: DecisionSource[];
    const failedConditions: string[] = [];

    try {
      sources = await this.permissionSources(subject, action, resource, context, global, failedConditions);
      policies = await this.matchingPolicies(subject, action, resource, context, tenantId, global, failedConditions);
    } catch (error) {
      if (error instanceof InvalidConditionError) {
        // A malformed condition denies. Treating it as "no condition" would
        // turn a typo in a policy into an open door.
        return finish(false, 'INVALID_POLICY_CONDITION', {
          effectiveState: 'DENY',
          failedConditions: [error.code],
        });
      }
      throw error;
    }

    const all = [...sources, ...policies];
    const denies = all.filter((source) => source.effect === 'DENY');
    const allows = all.filter((source) => source.effect === 'ALLOW');

    if (denies.length > 0) {
      return finish(false, 'EXPLICIT_DENY', {
        sources: denies,
        matchedPolicyIds: this.policyIds(denies),
        obligations: this.mergeObligations(denies),
        effectiveState: this.inheritedOnly(denies) ? 'INHERITED_DENY' : 'DENY',
        failedConditions,
      });
    }

    if (allows.length > 0) {
      return finish(true, 'EXPLICIT_ALLOW', {
        sources: allows,
        matchedPolicyIds: this.policyIds(allows),
        obligations: this.mergeObligations(allows),
        effectiveState: this.allowState(allows),
        failedConditions,
      });
    }

    return finish(false, 'PERMISSION_NOT_ASSIGNED', {
      effectiveState: 'NOT_ASSIGNED',
      failedConditions,
    });
  }

  /* ---------------------------------------------------------------- */

  private async permissionSources(
    subject: Subject,
    permissionCode: string,
    resource: Record<string, unknown>,
    context: EvaluationContext,
    global: boolean,
    failed: string[],
  ): Promise<DecisionSource[]> {
    const sources: DecisionSource[] = [];

    for (const grant of await this.repo.directGrants(subject.id, permissionCode)) {
      const conditions = this.jsonNode(grant.conditions);
      if (!this.conditions.evaluate(conditions, context)) {
        failed.push(`user_permission:${grant.id}`);
        continue;
      }
      sources.push({
        type: 'USER_PERMISSION',
        id: grant.id,
        effect: grant.effect,
        conditions,
        obligations: this.jsonObligations(grant.obligations),
        inherited: false,
      });
    }

    for (const roleContext of await this.repo.roleContexts(subject.id)) {
      if (!global && !this.scopes.matches(roleContext.scopeType, roleContext.scopeId, context.subject, resource)) {
        failed.push(`scope:${roleContext.roleCode}`);
        continue;
      }

      for (const grant of await this.repo.rolePermissions(roleContext.roleId, permissionCode, roleContext.inherited)) {
        const conditions = this.jsonNode(grant.conditions);
        if (!this.conditions.evaluate(conditions, context)) {
          failed.push(`role_permission:${roleContext.roleCode}`);
          continue;
        }
        sources.push({
          type: 'ROLE_PERMISSION',
          id: grant.id,
          effect: grant.effect,
          roleId: roleContext.roleId,
          roleCode: roleContext.roleCode,
          // A scope type the build does not recognise is recorded as null
          // rather than passed through; the grant was already skipped above,
          // so this only affects how the source is displayed.
          scopeType: this.asScopeType(roleContext.scopeType),
          scopeId: roleContext.scopeId,
          conditions,
          obligations: this.jsonObligations(grant.obligations),
          inherited: roleContext.inherited,
        });
      }
    }

    for (const grant of await this.repo.temporaryGrants(subject.id)) {
      if (!this.codeMatches(grant.permissionCodes, permissionCode)) continue;
      if (!this.scopes.matches(grant.scopeType, grant.scopeId, context.subject, resource)) continue;

      sources.push({
        type: grant.type,
        id: grant.id,
        effect: 'ALLOW',
        // Temporary access is always audited, whatever else it carries.
        obligations: { auditRequired: true },
        inherited: false,
      });
    }

    return sources;
  }

  private async matchingPolicies(
    subject: Subject,
    permissionCode: string,
    resource: Record<string, unknown>,
    context: EvaluationContext,
    tenantId: string | null,
    global: boolean,
    failed: string[],
  ): Promise<DecisionSource[]> {
    const roleCodes = (await this.repo.roleContexts(subject.id)).map((role) => role.roleCode);
    const resourceType = String(resource['resource_type'] ?? this.permissionResource(permissionCode));
    const matched: DecisionSource[] = [];

    for (const policy of await this.repo.policies(tenantId)) {
      if (!this.listMatches(policy.actions, permissionCode)) continue;
      if (!this.listMatches(policy.resources, resourceType)) continue;
      if (!this.subjectMatches(policy.subjects, subject, roleCodes)) continue;
      if (!global && !this.scopes.matches(policy.scopeType, policy.scopeId, context.subject, resource)) continue;

      const conditions = this.jsonNode(policy.conditions);
      // Validate before evaluating: a stored policy may predate the validator.
      this.conditions.validate(conditions);
      if (!this.conditions.evaluate(conditions, context)) {
        failed.push(`policy:${policy.code}`);
        continue;
      }

      matched.push({
        type: 'POLICY',
        id: policy.id,
        code: policy.code,
        effect: policy.effect,
        conditions,
        obligations: this.jsonObligations(policy.obligations),
        priority: policy.priority,
        inherited: false,
      });
    }

    return matched.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  private async buildContext(
    subject: Subject,
    resource: Record<string, unknown>,
    requestContext: NonNullable<AuthorizeInput['context']>,
    action: string,
    tenantId: string | null,
  ): Promise<EvaluationContext> {
    const resourceId = resource['id'] ?? resource['resource_id'];
    const relationships = resourceId
      ? await this.repo.relationships(
          subject.id,
          String(resource['resource_type'] ?? 'record'),
          String(resourceId),
          tenantId,
        )
      : [];

    return {
      subject: {
        ...subject,
        // "all-companies" is a UI scope, not a tenant. Leaving it in would
        // make every is_same_company condition compare against a sentinel.
        company_code: subject.company_code === 'all-companies' ? null : subject.company_code,
      },
      resource,
      environment: {
        current_time: new Date().toISOString(),
        current_date: new Date().toISOString().slice(0, 10),
        mfa_verified: false,
        ...requestContext.environment,
      },
      action: { permission: action, ...requestContext.action },
      relationships,
    };
  }

  /* ---------------------------------------------------------------- */

  private async finish(
    subject: Subject,
    action: string,
    resource: Record<string, unknown>,
    started: bigint,
    meta: EngineRequestMeta,
    requestContext: NonNullable<AuthorizeInput['context']>,
    partial: { allowed: boolean; reasonCode: ReasonCode } & Partial<AuthorizationDecision>,
  ): Promise<AuthorizationDecision> {
    const durationMs = Number((process.hrtime.bigint() - started) / 1_000_000n);
    const decisionId = randomUUID();

    const decision: AuthorizationDecision = {
      allowed: partial.allowed,
      decisionId,
      reasonCode: partial.reasonCode,
      reason: REASON_TEXT[partial.reasonCode],
      matchedPolicyIds: partial.matchedPolicyIds ?? [],
      sources: partial.sources ?? [],
      obligations: partial.obligations ?? {},
      failedConditions: partial.failedConditions ?? [],
      effectiveState: partial.effectiveState ?? (partial.allowed ? 'ALLOW' : 'DENY'),
      evaluationTimeMs: durationMs,
    };

    // The simulator sets audit:false — a what-if must not fill the audit
    // trail with decisions nobody acted on.
    if (requestContext.audit !== false) {
      try {
        await this.repo.writeDecision({
          decisionId,
          tenantId: this.subjectTenant(subject),
          userId: subject.id,
          action,
          resourceType: (resource['resource_type'] as string | undefined) ?? this.permissionResource(action),
          resourceId: resource['id'] === undefined ? null : String(resource['id']),
          decision: decision.allowed ? 'ALLOW' : 'DENY',
          reasonCode: decision.reasonCode,
          matchedPolicyIds: decision.matchedPolicyIds,
          failedConditions: decision.failedConditions,
          scope: {
            company_code: resource['company_code'] ?? null,
            branch_id: resource['branch_id'] ?? null,
            unit: resource['unit'] ?? null,
          },
          obligations: decision.obligations,
          changedFields: (requestContext.action?.['changed_fields'] as string[] | undefined) ?? [],
          businessReason: requestContext.businessReason ?? null,
          durationMs,
          sessionId: meta.sessionId ?? null,
          ipAddress: meta.ipAddress ?? null,
          device: meta.device ?? null,
          requestId: meta.requestId ?? null,
        });
      } catch {
        // An audit failure must not convert a valid decision into a 500. The
        // write is retried by nothing; the gap is visible in the log stream.
      }
    }

    return decision;
  }

  private async isGlobalActor(subject: Subject): Promise<boolean> {
    if (Number.parseInt(String(subject.role), 10) === 0) return true;
    return this.repo.hasGlobalAssignment(subject.id);
  }

  private isActive(subject: Subject): boolean {
    if (subject.is_deleted === true || Number(subject.is_deleted) === 1) return false;
    return ['0', 'ACTIVE'].includes(String(subject.status));
  }

  private subjectTenant(subject: Subject): string | null {
    const tenant = subject.company_code;
    return tenant && tenant !== 'all-companies' ? tenant : null;
  }

  private policyIds(sources: DecisionSource[]): number[] {
    return sources.filter((source) => source.type === 'POLICY').map((source) => Number(source.id));
  }

  private allowState(allows: DecisionSource[]): EffectiveState {
    if (allows.some((source) => source.conditions)) return 'CONDITIONAL';
    return this.inheritedOnly(allows) ? 'INHERITED_ALLOW' : 'ALLOW';
  }

  private inheritedOnly(sources: DecisionSource[]): boolean {
    return sources.length > 0 && sources.every((source) => source.inherited);
  }

  /**
   * Union of obligations across matched sources, biased toward restriction.
   *
   * Field lists concatenate and booleans OR together, so a second matching
   * role can add a masked field but never remove one. Merging the other way
   * would let a broad role silently unmask what a narrow one protected.
   */
  private mergeObligations(sources: DecisionSource[]): Obligations {
    const merged: Record<string, unknown> = {};

    for (const source of sources) {
      for (const [key, value] of Object.entries(source.obligations ?? {})) {
        if (Array.isArray(value)) {
          const existing = Array.isArray(merged[key]) ? (merged[key] as unknown[]) : [];
          merged[key] = [...new Set([...existing, ...value])];
        } else if (typeof value === 'boolean') {
          merged[key] = Boolean(merged[key]) || value;
        } else if (typeof value === 'number' && typeof merged[key] === 'number') {
          // maxRecords: the tighter limit wins.
          merged[key] = Math.min(merged[key] as number, value);
        } else {
          merged[key] = value;
        }
      }
    }

    return merged as Obligations;
  }

  private listMatches(patterns: unknown, value: string): boolean {
    const list = this.json(patterns);
    if (!Array.isArray(list)) return false;

    return list.some((pattern) => {
      if (pattern === '*' || pattern === value) return true;
      return typeof pattern === 'string' && pattern.endsWith('.*') && value.startsWith(pattern.slice(0, -1));
    });
  }

  private codeMatches(codes: string[], permissionCode: string): boolean {
    return codes.some((code) => {
      if (code === '*' || code === permissionCode) return true;
      return code.endsWith('.*') && permissionCode.startsWith(code.slice(0, -1));
    });
  }

  private subjectMatches(subjects: unknown, subject: Subject, roleCodes: string[]): boolean {
    const spec = this.json(subjects);
    // A policy with no subject filter applies to everyone it otherwise matches.
    if (!spec || typeof spec !== 'object') return true;

    const record = spec as Record<string, unknown>;
    const userIds = Array.isArray(record['userIds']) ? record['userIds'] : [];
    if (userIds.map(String).includes(String(subject.id))) return true;

    const specRoles = Array.isArray(record['roleCodes']) ? record['roleCodes'].map(String) : [];
    if (specRoles.some((code) => roleCodes.includes(code))) return true;

    const types = Array.isArray(record['types']) ? record['types'].map(String) : [];
    return types.includes(this.legacyRole(subject));
  }

  private legacyRole(subject: Subject): string {
    if (subject.type === 'agent' || Number.parseInt(String(subject.role), 10) === 4) return 'agent';

    const numeric = Number.parseInt(String(subject.role), 10);
    if ([0, 1, 2].includes(numeric) || String(subject.role).toLowerCase() === 'admin') return 'admin';

    return 'employee';
  }

  private permissionResource(code: string): string {
    const parts = code.split('.');
    parts.pop();
    return parts.join('.') || code;
  }

  /**
   * Decode a JSONB column.
   *
   * Prisma hands back a parsed value for a `jsonb` column but a string for a
   * `text` column holding JSON, and the legacy tables have both. Returning
   * null on malformed input rather than throwing is deliberate: a corrupt
   * obligations blob must not take down every decision that reads the row.
   */
  private json(value: unknown): unknown {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'object') return value;

    try {
      return JSON.parse(String(value));
    } catch {
      return null;
    }
  }

  private asScopeType(value: string | null): ScopeType | null {
    return value !== null && isScopeType(value) ? value : null;
  }

  /** A condition tree, or null. Arrays are not valid nodes. */
  private jsonNode(value: unknown): ConditionNode | null {
    const parsed = this.json(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    return parsed as ConditionNode;
  }

  private jsonObligations(value: unknown): Obligations | null {
    const parsed = this.json(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    return parsed as Obligations;
  }
}

/** Depth cap is enforced when role contexts are built; exported for the repo. */
export { MAX_INHERITANCE_DEPTH };
