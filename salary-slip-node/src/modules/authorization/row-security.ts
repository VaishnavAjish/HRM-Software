import type { AuthorizationDecision, DecisionSource, ScopeType, Subject } from './authorization.types.js';

/**
 * Row-level security.
 *
 * Turns the scopes that granted a decision into a query filter, so the
 * database returns only rows the caller may see.
 *
 * The alternative — fetch everything, then filter in application code — is
 * wrong in three separate ways, and this codebase has hit all three: the
 * count is wrong (pagination totals and KPI tiles leak the existence of rows
 * the caller cannot read), the work is wasted (every row is loaded to discard
 * most of them), and any path that forgets the filter returns everything.
 * A filter the query cannot run without cannot be forgotten.
 *
 * Returns a Prisma-shaped `where`. `null` means "no rows" — an explicit
 * refusal, distinct from `{}` which means "no restriction".
 */

export type WhereClause = Record<string, unknown>;

/** Column names per scope, for the tables this system actually filters. */
export interface ScopeColumns {
  tenant?: string;
  branch?: string;
  location?: string;
  unit?: string;
  department?: string;
  team?: string;
  owner?: string;
  creator?: string;
  assignee?: string;
  manager?: string;
  /** Primary key, for SELF. */
  id?: string;
}

/** Defaults matching the `users` table, which is what most scopes target. */
const DEFAULT_COLUMNS: Required<ScopeColumns> = {
  tenant: 'company_code',
  branch: 'branch_id',
  location: 'location_id',
  unit: 'unit',
  department: 'department',
  team: 'team_id',
  owner: 'owner_id',
  creator: 'created_by',
  assignee: 'assigned_to',
  manager: 'manager_id',
  id: 'id',
};

/**
 * One scope -> one clause.
 *
 * An unrecognised scope yields `null`, which removes that source from the
 * union rather than widening it. A scope this build does not understand must
 * never behave like GLOBAL.
 */
function clauseFor(
  scopeType: ScopeType | string | null | undefined,
  scopeId: string | null | undefined,
  subject: Subject,
  columns: Required<ScopeColumns>,
): WhereClause | null {
  const type = String(scopeType ?? 'TENANT').toUpperCase();

  switch (type) {
    case 'GLOBAL':
      return {};

    case 'TENANT':
    case 'COMPANY': {
      // The subject may hold several companies as a comma list; a grant
      // scoped to one of them narrows to that one.
      const tenants = scopeId
        ? [scopeId]
        : String(subject.company_code ?? '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);

      if (tenants.length === 0) return null;
      if (tenants.some((value) => ['all', 'all-companies'].includes(value))) return {};

      return { [columns.tenant]: { in: tenants } };
    }

    case 'BRANCH':
      return scopeId ? { [columns.branch]: scopeId } : null;
    case 'LOCATION':
      return scopeId ? { [columns.location]: scopeId } : null;
    case 'BUSINESS_UNIT':
      return scopeId ? { [columns.unit]: scopeId } : subject.unit ? { [columns.unit]: subject.unit } : null;
    case 'DEPARTMENT':
      return scopeId
        ? { [columns.department]: scopeId }
        : subject.department
          ? { [columns.department]: subject.department }
          : null;
    case 'TEAM':
      return scopeId ? { [columns.team]: scopeId } : null;

    case 'SELF':
      return { [columns.id]: subject.id };
    case 'OWN_RECORDS':
      return { OR: [{ [columns.owner]: subject.id }, { [columns.creator]: subject.id }] };
    case 'DIRECT_REPORTS':
      return { [columns.manager]: subject.id };
    case 'ASSIGNED_RECORDS':
      return { [columns.assignee]: subject.id };

    case 'SELECTED_RECORDS': {
      const ids = parseIds(scopeId);
      return ids.length > 0 ? { [columns.id]: { in: ids } } : null;
    }

    // INDIRECT_REPORTS / SHARED_RECORDS / CUSTOM_FILTER need a precomputed id
    // set that is not available at query-build time; they are enforced
    // per-record by the engine instead of being pushed into the query.
    default:
      return null;
  }
}

function parseIds(scopeId: string | null | undefined): string[] {
  if (!scopeId) return [];

  try {
    const decoded: unknown = JSON.parse(scopeId);
    if (Array.isArray(decoded)) return decoded.map((value) => String(value).trim());
  } catch {
    // Not JSON; fall through to the comma form.
  }
  return scopeId.split(',').map((value) => value.trim()).filter(Boolean);
}

/**
 * Build a `where` from a decision.
 *
 * Holding two scopes widens access, so the ALLOW clauses are OR-ed. DENY
 * sources are subtracted with `NOT`, preserving the engine's rule that an
 * explicit deny beats an allow — including at the row level, where a role
 * denied one branch must not see it via a company-wide grant.
 */
export function buildAuthorizedWhere(
  decision: AuthorizationDecision,
  subject: Subject,
  columns: ScopeColumns = {},
): WhereClause | null {
  if (!decision.allowed) return null;

  const resolved = { ...DEFAULT_COLUMNS, ...columns };
  const allows: WhereClause[] = [];
  const denies: WhereClause[] = [];

  for (const source of decision.sources) {
    const clause = clauseFor(source.scopeType, source.scopeId, subject, resolved);
    if (clause === null) continue;

    (source.effect === 'DENY' ? denies : allows).push(clause);
  }

  // An allow with no usable scope clause is unscoped by construction — the
  // engine already decided it applies, so the query must not narrow it.
  const unrestricted = allows.some((clause) => Object.keys(clause).length === 0);

  const where: WhereClause = {};
  if (!unrestricted && allows.length > 0) {
    Object.assign(where, allows.length === 1 ? allows[0] : { OR: allows });
  }

  if (denies.length > 0) {
    where['NOT'] = denies.length === 1 ? denies[0] : { OR: denies };
  }

  return where;
}

/**
 * Merge an authorization filter with a caller's own filter.
 *
 * AND, always. A caller-supplied filter may narrow what they see and must
 * never widen it, so the two can only ever be combined this way.
 */
export function withAuthorization(
  authorized: WhereClause | null,
  caller: WhereClause = {},
): WhereClause | null {
  if (authorized === null) return null;
  if (Object.keys(authorized).length === 0) return caller;
  if (Object.keys(caller).length === 0) return authorized;

  return { AND: [authorized, caller] };
}

/** Scopes that cannot be pushed into a query and need a per-record check. */
export function needsPerRecordCheck(sources: DecisionSource[]): boolean {
  return sources.some((source) =>
    ['INDIRECT_REPORTS', 'SHARED_RECORDS', 'CUSTOM_FILTER'].includes(String(source.scopeType ?? '')),
  );
}
