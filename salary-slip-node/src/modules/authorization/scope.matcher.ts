import { isScopeType, type ScopeType } from './authorization.types.js';

/**
 * Decides whether a scoped grant reaches a particular resource.
 *
 * Port of App\Services\Authorization\ScopeMatcher.
 *
 * Scope is checked *before* permissions, not after: holding
 * `hr.employee.update` at BRANCH scope is not the same as holding it, and
 * evaluating the permission first and the scope second is how a branch admin
 * ends up editing head office.
 */

export type ResourceLike = Record<string, unknown>;
export type SubjectLike = Record<string, unknown>;

const str = (value: unknown): string | null =>
  value === null || value === undefined || value === '' ? null : String(value);

/** Wildcards a company field may hold to mean "not scoped to one company". */
const ALL_TENANTS = ['all', 'all-companies'];

export class ScopeMatcher {
  /**
   * Tenant isolation.
   *
   * A subject's company_code is not always a single value. Multi-company
   * admins created through "Company Access (select one or both)" store it as a
   * comma list — "nidhi-impex,silver-star" — and the frontend's default "All
   * Companies" view asks for the literal tenant "all-companies" on behalf of
   * every admin who can switch scope. Plain string equality matches neither,
   * which denied legitimate multi-company admins on every permission-gated
   * route while super admins sailed through only because role 0 short-circuits
   * to global beforehand.
   */
  tenantMatches(subjectTenant: string | null, resourceTenant: string | null, global: boolean): boolean {
    if (global) return true;
    if (!resourceTenant || ALL_TENANTS.includes(resourceTenant)) return true;
    if (subjectTenant === null) return false;

    const subjectTenants = subjectTenant
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (subjectTenants.some((value) => ALL_TENANTS.includes(value))) return true;

    return subjectTenants.includes(resourceTenant);
  }

  /**
   * Does a grant held at `scopeType`/`scopeId` cover this resource?
   *
   * An unknown scope type returns false rather than throwing. A row with a
   * scope this build does not understand must not be treated as unscoped —
   * that would turn a forward-compatibility gap into a privilege escalation.
   */
  matches(
    scopeType: string | null | undefined,
    scopeId: string | null | undefined,
    subject: SubjectLike,
    resource: ResourceLike,
  ): boolean {
    const type = (scopeType || 'TENANT').toUpperCase();
    if (!isScopeType(type)) return false;

    const resourceId = str(resource['id'] ?? resource['resource_id']);
    const subjectId = str(subject['id']);

    switch (type as ScopeType) {
      case 'GLOBAL':
        return true;

      case 'TENANT':
      case 'COMPANY': {
        const tenant = this.tenant(resource);
        // A resource with no tenant of its own cannot violate tenant
        // isolation — typically a lookup table or an unsaved draft.
        if (tenant === null) return true;
        return this.tenantMatches(scopeId || str(subject['company_code']), tenant, false);
      }

      case 'GROUP':
        return this.equals(scopeId, resource['group_id']);
      case 'LEGAL_ENTITY':
        return this.equals(scopeId, resource['legal_entity_id']);
      case 'BRANCH':
        return this.equals(scopeId, resource['branch_id']);
      case 'LOCATION':
        return this.equals(scopeId, resource['location_id']);
      case 'BUSINESS_UNIT':
        return this.equals(scopeId, resource['unit'] ?? resource['business_unit_id']);
      case 'DEPARTMENT':
        return this.equals(scopeId, resource['department_id'] ?? resource['department']);
      case 'TEAM':
        return this.equals(scopeId, resource['team_id']);

      case 'SELF':
        return this.equals(subjectId, resourceId);
      case 'OWN_RECORDS':
        return this.equals(subjectId, resource['owner_id'] ?? resource['created_by']);
      case 'DIRECT_REPORTS':
        return this.equals(subjectId, resource['manager_id']);
      case 'INDIRECT_REPORTS':
        return this.inList(resourceId, subject['indirect_report_ids']);
      case 'ASSIGNED_RECORDS':
        return this.equals(subjectId, resource['assigned_to']);
      case 'SHARED_RECORDS':
        return this.inList(subjectId, resource['shared_with']);
      case 'SELECTED_RECORDS':
        return resourceId !== null && this.selectedIds(scopeId).includes(resourceId);
      case 'CUSTOM_FILTER':
        return this.inList(resourceId, subject['custom_scope_ids']);
    }
  }

  /** The tenant a resource belongs to, under any of its column spellings. */
  tenant(resource: ResourceLike): string | null {
    return str(resource['tenant_id'] ?? resource['company_code'] ?? resource['organization_code']);
  }

  /**
   * Both sides must be present. Two nulls are not a match — otherwise a grant
   * scoped to a branch would cover every record whose branch is unset.
   */
  private equals(a: unknown, b: unknown): boolean {
    const left = str(a);
    const right = str(b);
    return left !== null && right !== null && left === right;
  }

  private inList(needle: string | null, haystack: unknown): boolean {
    if (needle === null) return false;
    const values = Array.isArray(haystack) ? haystack : haystack === undefined || haystack === null ? [] : [haystack];
    return values.map((value) => String(value)).includes(needle);
  }

  /** `scopeId` for SELECTED_RECORDS holds a JSON array or a comma list. */
  private selectedIds(scopeId: string | null | undefined): string[] {
    if (!scopeId) return [];

    try {
      const decoded: unknown = JSON.parse(scopeId);
      if (Array.isArray(decoded)) return decoded.map((value) => String(value).trim());
    } catch {
      // Not JSON; fall through to the comma-separated form.
    }

    return scopeId.split(',').map((value) => value.trim());
  }
}

export const scopes = new ScopeMatcher();
