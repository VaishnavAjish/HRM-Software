import { db } from '../../db/client.js';
import { MAX_INHERITANCE_DEPTH, type AuthorizationRepository, type DecisionLogEntry, type GrantRow, type PolicyRow, type RoleContext, type TemporaryGrantRow } from './authorization.engine.js';

/**
 * Prisma-backed storage for the engine.
 *
 * Every query here is raw SQL rather than a Prisma delegate, for two reasons.
 * The authorization tables are created by prisma/sql/0001 and deliberately
 * absent from schema.prisma — the schema file is introspected from a database
 * this project does not own, and adding models to it would invite someone to
 * run `prisma migrate`. And the queries are narrow, hot, and shaped by
 * validity windows that read far more clearly as SQL than as nested Prisma
 * filters.
 *
 * Parameters are always bound, never interpolated.
 */

const num = (value: unknown): number => (typeof value === 'bigint' ? Number(value) : Number(value ?? 0));

/** Wildcard ancestors of a code: hr.employee.read -> hr.employee.*, hr.* */
function wildcards(permissionCode: string): string[] {
  const parts = permissionCode.split('.');
  const out: string[] = [];

  while (parts.length > 1) {
    parts.pop();
    out.push(`${parts.join('.')}.*`);
  }
  return out;
}

interface RawGrant {
  id: bigint | number;
  effect: string | null;
  is_denied?: boolean | null;
  conditions: unknown;
  obligations: unknown;
}

function toGrant(row: RawGrant): GrantRow {
  // user_permissions predates `effect` and uses is_denied; role_permissions
  // gained `effect` in 0001. One shape out, whichever came in.
  const effect = row.effect
    ? (String(row.effect).toUpperCase() as 'ALLOW' | 'DENY')
    : row.is_denied
      ? 'DENY'
      : 'ALLOW';

  return { id: num(row.id), effect, conditions: row.conditions, obligations: row.obligations };
}

export class PrismaAuthorizationRepository implements AuthorizationRepository {
  async directGrants(userId: number, permissionCode: string): Promise<GrantRow[]> {
    const rows = await db.$queryRawUnsafe<RawGrant[]>(
      `SELECT p.id, up.is_denied, up.conditions, up.obligations, NULL::text AS effect
         FROM user_permissions up
         JOIN permissions p ON p.id = up.permission_id
        WHERE up.user_id = $1
          AND p.is_active = TRUE
          AND (p.code = $2 OR p.name = $2)
          AND (up.valid_from  IS NULL OR up.valid_from  <= now())
          AND (up.valid_until IS NULL OR up.valid_until  > now())`,
      userId,
      permissionCode,
    );

    return rows.map(toGrant);
  }

  /**
   * Roles held by a user, plus everything those roles inherit from.
   *
   * Direct assignments come from authorization_role_assignments (scoped) and
   * the legacy user_roles pivot (unscoped) — the legacy rows are included so
   * the engine keeps working through the migration window, and drop out
   * naturally once that table is gone.
   *
   * Inherited roles keep the *child's* scope. A parent role reached through a
   * branch-scoped child must not suddenly apply company-wide.
   */
  async roleContexts(userId: number): Promise<RoleContext[]> {
    const contexts: RoleContext[] = [];
    const seen = new Set<number>();

    const scoped = await db.$queryRawUnsafe<
      Array<{ role_id: bigint; code: string | null; scope_type: string | null; scope_id: string | null }>
    >(
      `SELECT a.role_id, r.code, a.scope_type, a.scope_id
         FROM authorization_role_assignments a
         JOIN roles r ON r.id = a.role_id
        WHERE a.user_id = $1
          AND a.status = 'ACTIVE'
          AND r.is_active = TRUE
          AND r.status = 'ACTIVE'
          AND (a.valid_from  IS NULL OR a.valid_from  <= now())
          AND (a.valid_until IS NULL OR a.valid_until  > now())`,
      userId,
    );

    for (const row of scoped) {
      const roleId = num(row.role_id);
      if (seen.has(roleId)) continue;
      seen.add(roleId);

      contexts.push({
        roleId,
        roleCode: row.code ?? String(roleId),
        scopeType: row.scope_type,
        scopeId: row.scope_id,
        inherited: false,
      });
    }

    const legacy = await db.$queryRawUnsafe<
      Array<{ role_id: bigint; code: string | null; default_scope_type: string | null; company_code: string | null }>
    >(
      `SELECT ur.role_id, r.code, r.default_scope_type, u.company_code
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         JOIN users u ON u.id = ur.user_id
        WHERE ur.user_id = $1 AND r.is_active = TRUE`,
      userId,
    );

    for (const row of legacy) {
      const roleId = num(row.role_id);
      if (seen.has(roleId)) continue;
      seen.add(roleId);

      const scopeType = row.default_scope_type ?? 'TENANT';
      contexts.push({
        roleId,
        roleCode: row.code ?? String(roleId),
        scopeType,
        scopeId: scopeType === 'GLOBAL' ? null : row.company_code,
        inherited: false,
      });
    }

    // Breadth-first over inheritance edges, depth-capped so a cycle inserted
    // directly into the table cannot spin here.
    let frontier = [...contexts];
    for (let depth = 0; depth < MAX_INHERITANCE_DEPTH && frontier.length > 0; depth += 1) {
      const next: RoleContext[] = [];

      for (const child of frontier) {
        const parents = await db.$queryRawUnsafe<Array<{ id: bigint; code: string | null }>>(
          `SELECT r.id, r.code
             FROM authorization_role_inheritances i
             JOIN roles r ON r.id = i.parent_role_id
            WHERE i.child_role_id = $1 AND r.is_active = TRUE AND r.status = 'ACTIVE'`,
          child.roleId,
        );

        for (const parent of parents) {
          const roleId = num(parent.id);
          if (seen.has(roleId)) continue;
          seen.add(roleId);

          const row: RoleContext = {
            roleId,
            roleCode: parent.code ?? String(roleId),
            scopeType: child.scopeType,
            scopeId: child.scopeId,
            inherited: true,
          };
          contexts.push(row);
          next.push(row);
        }
      }
      frontier = next;
    }

    return contexts;
  }

  /**
   * Permissions a role grants for one code.
   *
   * `inheritedOnly` narrows to grants flagged inherit_to_children, which is
   * how a parent role can hold access that deliberately does not flow down.
   */
  async rolePermissions(roleId: number, permissionCode: string, inheritedOnly: boolean): Promise<GrantRow[]> {
    const codes = [permissionCode, '*', ...wildcards(permissionCode)];

    const rows = await db.$queryRawUnsafe<RawGrant[]>(
      `SELECT p.id, rp.effect, rp.conditions, rp.obligations
         FROM role_permissions rp
         JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = $1
          AND p.is_active = TRUE
          AND (p.code = ANY($2::text[]) OR p.name = $3)
          AND ($4::boolean = FALSE OR rp.inherit_to_children = TRUE)
          AND (rp.valid_from  IS NULL OR rp.valid_from  <= now())
          AND (rp.valid_until IS NULL OR rp.valid_until  > now())`,
      roleId,
      codes,
      permissionCode,
      inheritedOnly,
    );

    return rows.map(toGrant);
  }

  async policies(tenantId: string | null): Promise<PolicyRow[]> {
    const rows = await db.$queryRawUnsafe<
      Array<{
        id: bigint;
        code: string;
        effect: string;
        subjects: unknown;
        actions: unknown;
        resources: unknown;
        scope_type: string | null;
        scope_id: string | null;
        conditions: unknown;
        obligations: unknown;
        priority: number;
      }>
    >(
      `SELECT id, code, effect, subjects, actions, resources, scope_type, scope_id,
              conditions, obligations, priority
         FROM authorization_policies
        WHERE status = 'ACTIVE'
          AND (tenant_id IS NULL OR tenant_id = $1)
          AND (valid_from  IS NULL OR valid_from  <= now())
          AND (valid_until IS NULL OR valid_until  > now())
        ORDER BY priority DESC`,
      tenantId,
    );

    return rows.map((row) => ({
      id: num(row.id),
      code: row.code,
      effect: String(row.effect).toUpperCase() as 'ALLOW' | 'DENY',
      subjects: row.subjects,
      actions: row.actions,
      resources: row.resources,
      scopeType: row.scope_type,
      scopeId: row.scope_id,
      conditions: row.conditions,
      obligations: row.obligations,
      priority: Number(row.priority),
    }));
  }

  /** Delegations and emergency grants, both time-boxed, in one pass. */
  async temporaryGrants(userId: number): Promise<TemporaryGrantRow[]> {
    const rows = await db.$queryRawUnsafe<
      Array<{ id: bigint; kind: string; permission_codes: unknown; scope_type: string | null; scope_id: string | null }>
    >(
      `SELECT id, 'DELEGATION' AS kind, permission_codes, scope_type, scope_id
         FROM authorization_delegations
        WHERE delegate_id = $1 AND status = 'ACTIVE'
          AND valid_from <= now() AND valid_until > now()
       UNION ALL
       SELECT id, 'EMERGENCY_ACCESS' AS kind, permission_codes, scope_type, scope_id
         FROM authorization_emergency_grants
        WHERE user_id = $1 AND status = 'ACTIVE'
          AND valid_from <= now() AND valid_until > now()`,
      userId,
    );

    return rows.map((row) => ({
      id: num(row.id),
      type: row.kind as TemporaryGrantRow['type'],
      permissionCodes: Array.isArray(row.permission_codes) ? row.permission_codes.map(String) : [],
      scopeType: row.scope_type,
      scopeId: row.scope_id,
    }));
  }

  async relationships(
    userId: number,
    resourceType: string,
    resourceId: string,
    tenantId: string | null,
  ): Promise<string[]> {
    const rows = await db.$queryRawUnsafe<Array<{ relationship: string }>>(
      `SELECT relationship
         FROM authorization_relationships
        WHERE subject_type = 'user' AND subject_id = $1
          AND resource_type = $2 AND resource_id = $3
          AND (tenant_id IS NULL OR tenant_id = $4)
          AND (valid_from  IS NULL OR valid_from  <= now())
          AND (valid_until IS NULL OR valid_until  > now())`,
      String(userId),
      resourceType,
      resourceId,
      tenantId,
    );

    return rows.map((row) => row.relationship);
  }

  async hasGlobalAssignment(userId: number): Promise<boolean> {
    const rows = await db.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n
         FROM authorization_role_assignments a
         JOIN roles r ON r.id = a.role_id
        WHERE a.user_id = $1 AND a.status = 'ACTIVE' AND a.scope_type = 'GLOBAL'
          AND r.is_active = TRUE AND r.status = 'ACTIVE'
          AND (a.valid_until IS NULL OR a.valid_until > now())`,
      userId,
    );

    return (rows[0]?.n ?? 0) > 0;
  }

  /**
   * Append-only. There is no update or delete path for this table anywhere in
   * the codebase, which is what makes the audit trail worth trusting.
   */
  async writeDecision(entry: DecisionLogEntry): Promise<void> {
    await db.$executeRawUnsafe(
      `INSERT INTO authorization_decision_logs
         (decision_id, tenant_id, user_id, session_id, action, resource_type, resource_id,
          decision, reason_code, matched_policy_ids, failed_conditions, scope, obligations,
          ip_address, device, request_id, changed_fields, business_reason,
          authorization_version, duration_ms, created_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb,
               $13::jsonb, $14, $15, $16, $17::jsonb, $18, 'v2', $19, now())`,
      entry.decisionId,
      entry.tenantId,
      entry.userId,
      entry.sessionId,
      entry.action,
      entry.resourceType,
      entry.resourceId,
      entry.decision,
      entry.reasonCode,
      JSON.stringify(entry.matchedPolicyIds),
      JSON.stringify(entry.failedConditions),
      JSON.stringify(entry.scope),
      JSON.stringify(entry.obligations),
      entry.ipAddress,
      entry.device?.slice(0, 255) ?? null,
      entry.requestId,
      JSON.stringify(entry.changedFields),
      entry.businessReason?.slice(0, 255) ?? null,
      entry.durationMs,
    );
  }
}
