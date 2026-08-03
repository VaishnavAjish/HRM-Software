/**
 * Core authorization vocabulary.
 *
 * These types are the contract between the engine, the routes and the React
 * client. They are deliberately declared once here rather than inline in each
 * module: the permission matrix, the simulator and the enforcement middleware
 * all render the *same* decision object, and a drift between them is exactly
 * how a UI ends up claiming access that the API refuses.
 *
 * Parity note: the shapes mirror App\Services\Authorization\* so a shadow
 * comparison between the PHP and Node engines can diff two decisions field by
 * field without a translation layer.
 */

/** Scope kinds, in narrowing order. Mirrors ScopeMatcher::matches(). */
export const SCOPE_TYPES = [
  'GLOBAL',
  'TENANT',
  'GROUP',
  'COMPANY',
  'LEGAL_ENTITY',
  'BRANCH',
  'LOCATION',
  'BUSINESS_UNIT',
  'DEPARTMENT',
  'TEAM',
  'SELF',
  'OWN_RECORDS',
  'DIRECT_REPORTS',
  'INDIRECT_REPORTS',
  'ASSIGNED_RECORDS',
  'SHARED_RECORDS',
  'SELECTED_RECORDS',
  'CUSTOM_FILTER',
] as const;

export type ScopeType = (typeof SCOPE_TYPES)[number];

export function isScopeType(value: unknown): value is ScopeType {
  return typeof value === 'string' && (SCOPE_TYPES as readonly string[]).includes(value);
}

/**
 * The five states a matrix cell can hold.
 *
 * NOT_ASSIGNED is distinct from DENY on purpose: "nobody granted this" and
 * "somebody explicitly refused this" behave identically at the API boundary
 * but must not look identical to an administrator, because only the second
 * survives a new grant from an inherited role.
 */
export type EffectiveState =
  | 'ALLOW'
  | 'DENY'
  | 'INHERITED_ALLOW'
  | 'INHERITED_DENY'
  | 'CONDITIONAL'
  | 'NOT_ASSIGNED';

export type Effect = 'ALLOW' | 'DENY';

/** Where a decision came from, for the "Inherited From" panel. */
export type SourceType =
  | 'USER_PERMISSION'
  | 'ROLE_PERMISSION'
  | 'POLICY'
  | 'DELEGATION'
  | 'EMERGENCY_ACCESS';

export interface DecisionSource {
  type: SourceType;
  id: number | string;
  effect: Effect;
  /** Present for ROLE_PERMISSION; drives the inheritance visualization. */
  roleId?: number;
  roleCode?: string;
  scopeType?: ScopeType | null;
  scopeId?: string | null;
  conditions?: ConditionNode | null;
  obligations?: Obligations | null;
  inherited: boolean;
  /** POLICY only — ordering key when several policies match. */
  priority?: number;
  code?: string;
}

/**
 * Obligations are the "yes, but" half of a decision.
 *
 * An ALLOW that carries `maskedFields` is still an allow — the caller must
 * apply the obligation. Returning them alongside the boolean rather than
 * folding them into it is what makes field-level security expressible without
 * a second round trip.
 */
export interface Obligations {
  allowedFields?: string[];
  hiddenFields?: string[];
  maskedFields?: string[];
  readOnlyFields?: string[];
  queryScope?: Record<string, unknown>;
  requireMfa?: boolean;
  requireReason?: boolean;
  requireApproval?: boolean;
  auditRequired?: boolean;
  maxRecords?: number;
  watermark?: boolean;
}

export type ReasonCode =
  | 'EXPLICIT_ALLOW'
  | 'EXPLICIT_DENY'
  | 'PERMISSION_NOT_ASSIGNED'
  | 'SUBJECT_DISABLED'
  | 'TENANT_ACCESS_DENIED'
  | 'AUTHENTICATION_REQUIRED'
  | 'SCOPE_ACCESS_DENIED'
  | 'SEPARATION_OF_DUTY_VIOLATION'
  | 'TEMPORARY_ACCESS_EXPIRED'
  | 'INVALID_POLICY_CONDITION';

export interface AuthorizationDecision {
  allowed: boolean;
  decisionId: string;
  reasonCode: ReasonCode;
  /** Human-readable, safe to surface in a toast. Never leaks policy internals. */
  reason: string;
  matchedPolicyIds: number[];
  sources: DecisionSource[];
  obligations: Obligations;
  failedConditions: string[];
  effectiveState: EffectiveState;
  evaluationTimeMs: number;
  /** Populated only while shadow mode is on, for the migration diff. */
  legacyDecision?: { allowed: boolean; reasonCode: string } | null;
}

/* ------------------------------------------------------------------ */
/* Condition tree                                                      */
/* ------------------------------------------------------------------ */

export const CONDITION_OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'in',
  'not_in',
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
  'between',
  'starts_with',
  'ends_with',
  'exists',
  'not_exists',
  'matches',
  'is_owner',
  'is_creator',
  'is_assignee',
  'is_manager',
  'is_direct_report',
  'is_indirect_report',
  'is_same_company',
  'is_same_branch',
  'is_same_department',
  'is_same_team',
] as const;

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export function isConditionOperator(value: unknown): value is ConditionOperator {
  return typeof value === 'string' && (CONDITION_OPERATORS as readonly string[]).includes(value);
}

/** An operand is either a literal, or a `{path}` reference into the context. */
export type Operand = unknown | { path: string };

export interface ComparisonNode {
  operator: ConditionOperator;
  left?: Operand;
  /** Alias for `left`, accepted because existing policy JSON uses it. */
  attribute?: Operand;
  right?: Operand;
  /** Alias for `right`, same reason. */
  value?: Operand;
}

export interface AllNode {
  all: ConditionNode[];
}
export interface AnyNode {
  any: ConditionNode[];
}
export interface NotNode {
  not: ConditionNode;
}

export type ConditionNode = AllNode | AnyNode | NotNode | ComparisonNode;

/* ------------------------------------------------------------------ */
/* Evaluation context                                                  */
/* ------------------------------------------------------------------ */

/**
 * Everything a condition may read.
 *
 * Nothing here is client-supplied except `action`, and even that is filtered
 * before it arrives: a caller that could write `subject.company_code` would be
 * able to grant itself another tenant's records.
 */
export interface EvaluationContext {
  subject: Record<string, unknown>;
  resource: Record<string, unknown>;
  environment: Record<string, unknown>;
  action: Record<string, unknown>;
  relationships: string[];
  [key: string]: unknown;
}

/** The caller being authorized. A thin projection of the users row. */
export interface Subject {
  id: number;
  role: number | string | null;
  type: string | null;
  company_code: string | null;
  unit: string | null;
  department: string | null;
  status: string | number | null;
  is_deleted: boolean | number | null;
  emp_code?: string | null;
  [key: string]: unknown;
}

export interface AuthorizeInput {
  subject: Subject;
  action: string;
  resource?: Record<string, unknown> | null;
  context?: {
    environment?: Record<string, unknown>;
    action?: Record<string, unknown>;
    businessReason?: string;
    /** Set false by the simulator so a what-if does not pollute the audit. */
    audit?: boolean;
  };
}
