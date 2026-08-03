/**
 * Deterministic old -> new mapping for the authorization migration.
 *
 * Derived from the actual production data (niss_hrms), not from the seeder:
 *
 *   96 permissions   in a `resource.action` namespace
 *   15 roles         of which 10 are per-user override carriers
 *    1 user_role     that resolves to a live user (4 rows are orphaned)
 *    0 user_permissions
 *   24 permission_dimensions, all dimension='page'
 *  341 users         authorized almost entirely by the numeric users.role
 *
 * The important consequence: production's vocabulary and RbacSeeder's
 * canonical `domain.resource.action` vocabulary are disjoint. A naive
 * "seed the catalogue and drop the rest" migration would silently discard
 * roughly seventy live permissions, most of them from the eleven migrations
 * that exist in production but not in this repository. Every legacy code
 * therefore either maps explicitly below or is carried across by
 * `deriveCode`, and `unmapped()` reports anything that did neither.
 */

/** Explicit mappings. Anything absent falls through to `deriveCode`. */
export const PERMISSION_MAP: Readonly<Record<string, string>> = {
  // ---- Employees -----------------------------------------------------
  'employees.view': 'hr.employee.read',
  'employees.create': 'hr.employee.create',
  'employees.edit': 'hr.employee.update',
  'employees.delete': 'hr.employee.delete',
  'employees.import': 'hr.employee.import',

  // ---- Appointments --------------------------------------------------
  'appointments.view': 'hr.appointment.read',
  'appointments.create': 'hr.appointment.create',
  'appointments.edit': 'hr.appointment.update',
  'appointments.delete': 'hr.appointment.delete',
  // The reveal permission the Aadhaar export flow already gates on.
  'appointments.view_full_aadhaar': 'hr.employee.aadhaar.reveal',

  // ---- Salary slips (note the space in the legacy name) --------------
  'salary slips.view': 'payroll.payslip.read',
  'salary slips.create': 'payroll.payslip.create',
  'salary slips.edit': 'payroll.payslip.update',
  'salary slips.delete': 'payroll.payslip.delete',
  'salary slips.import': 'payroll.payslip.import',

  // ---- Departments ---------------------------------------------------
  'departments.view': 'hr.department.read',
  'departments.create': 'hr.department.create',
  'departments.edit': 'hr.department.update',
  'departments.delete': 'hr.department.delete',

  // ---- Roles & permissions (space AND ampersand) ---------------------
  'roles & permissions.view': 'admin.role.read',
  'roles & permissions.create': 'admin.role.create',
  'roles & permissions.edit': 'admin.role.update',
  'roles & permissions.delete': 'admin.role.delete',

  // ---- Reports -------------------------------------------------------
  'reports.view': 'ui.admin.reports.view',
  'reports.export': 'payroll.report.export',

  // ---- Security ------------------------------------------------------
  'security.view': 'admin.security.read',
  'security.users.manage': 'admin.user.update',
  'security.sessions.revoke': 'admin.session.revoke',
  'security.mfa.manage': 'admin.mfa.manage',
  'security.access.inspect': 'admin.authorization.audit.read',

  // ---- Branch & location ---------------------------------------------
  'branches.manage': 'admin.organization.update',
  'branches.admins': 'admin.organization.update',
  'branches.calendars': 'admin.organization.update',
};

/**
 * Legacy domains that keep their own namespace.
 *
 * These arrived with the eleven drifted migrations and have no counterpart in
 * the canonical catalogue. Renaming them would mean inventing a mapping for
 * subsystems this repository cannot see, so they are carried across verbatim
 * under a stable prefix instead — preserved, not guessed at.
 */
const PRESERVED_DOMAINS = ['platform', 'company', 'groups', 'workforce', 'org', 'dashboard'] as const;

/** Normalise a legacy name into a valid code: lowercase, no spaces or `&`. */
function slugSegment(segment: string): string {
  return segment
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Fallback for a legacy code with no explicit mapping.
 *
 * `dashboard.payroll.view` already reads as domain.resource.action and is
 * returned unchanged. `platform.flags.manage` likewise. Anything else is
 * slugged and prefixed with its own first segment so it stays unique and
 * legible rather than being dropped.
 */
export function deriveCode(legacyName: string): string {
  const segments = legacyName.split('.').map(slugSegment).filter(Boolean);
  if (segments.length === 0) return 'legacy.unknown';

  const [head] = segments;
  if (head && (PRESERVED_DOMAINS as readonly string[]).includes(head)) {
    return segments.join('.');
  }

  // Two-segment legacy names become legacy.<resource>.<action> so they can
  // never collide with a canonical code that happens to share a prefix.
  return segments.length >= 3 ? segments.join('.') : ['legacy', ...segments].join('.');
}

export function mapPermission(legacyName: string): { code: string; explicit: boolean } {
  const explicit = PERMISSION_MAP[legacyName];
  if (explicit) return { code: explicit, explicit: true };

  return { code: deriveCode(legacyName), explicit: false };
}

/** Legacy codes carried across without an explicit mapping, for the report. */
export function unmapped(legacyNames: string[]): string[] {
  return legacyNames.filter((name) => !PERMISSION_MAP[name]);
}

/* ------------------------------------------------------------------ */
/* Roles                                                               */
/* ------------------------------------------------------------------ */

export interface RoleMapping {
  code: string;
  name: string;
  roleType: 'SYSTEM' | 'BUSINESS' | 'CUSTOM';
  defaultScopeType: string;
  isSystem: boolean;
}

/** Named legacy roles that become canonical roles. */
export const ROLE_MAP: Readonly<Record<string, RoleMapping>> = {
  'Super Admin': {
    code: 'super_administrator',
    name: 'Super Admin',
    roleType: 'SYSTEM',
    defaultScopeType: 'GLOBAL',
    isSystem: true,
  },
  Admin: {
    code: 'tenant_administrator',
    name: 'Admin',
    roleType: 'SYSTEM',
    defaultScopeType: 'TENANT',
    isSystem: true,
  },
  Master: {
    code: 'master_administrator',
    name: 'Master',
    roleType: 'SYSTEM',
    defaultScopeType: 'TENANT',
    isSystem: true,
  },
  'HR Manager': {
    code: 'hr_manager',
    name: 'HR Manager',
    roleType: 'BUSINESS',
    defaultScopeType: 'COMPANY',
    isSystem: false,
  },
  Viewer: {
    code: 'viewer',
    name: 'Viewer',
    roleType: 'BUSINESS',
    defaultScopeType: 'TENANT',
    isSystem: false,
  },
};

/**
 * `User_<id>_Permissions` roles.
 *
 * Ten of the fifteen legacy roles follow this pattern. They are not real
 * roles — they exist only to hang a per-user set of page overrides off, which
 * the new model expresses directly as user_permissions rows. The regex is how
 * the migration tells them apart from a genuine custom role that happens to
 * be unused.
 */
const PER_USER_ROLE = /^User_(\d+)_Permissions$/;

export function perUserRoleTarget(roleName: string): number | null {
  const match = PER_USER_ROLE.exec(roleName);
  if (!match?.[1]) return null;

  const id = Number.parseInt(match[1], 10);
  return Number.isNaN(id) ? null : id;
}

/* ------------------------------------------------------------------ */
/* users.role -> scoped assignment                                     */
/* ------------------------------------------------------------------ */

export interface AssignmentMapping {
  roleCode: string;
  scopeType: string;
  /** Which user column supplies the scope id, if any. */
  scopeFrom: 'company_code' | 'unit' | null;
}

/**
 * The numeric column that actually authorizes production today.
 *
 * Role 2 is a unit-scoped admin — SalariesSlipController and UserController
 * both narrow it by company_code AND unit — so it maps to BUSINESS_UNIT
 * rather than TENANT. Role 3 is an employee and role 4 an agent; the numbers
 * carry no ordering, which is why this is a lookup and not a comparison.
 */
export const LEGACY_ROLE_MAP: Readonly<Record<string, AssignmentMapping>> = {
  '0': { roleCode: 'super_administrator', scopeType: 'GLOBAL', scopeFrom: null },
  '1': { roleCode: 'tenant_administrator', scopeType: 'TENANT', scopeFrom: 'company_code' },
  '2': { roleCode: 'unit_administrator', scopeType: 'BUSINESS_UNIT', scopeFrom: 'unit' },
  '3': { roleCode: 'employee', scopeType: 'SELF', scopeFrom: null },
  '4': { roleCode: 'agent', scopeType: 'TENANT', scopeFrom: 'company_code' },
};

export function mapLegacyRole(role: unknown, type: string | null): AssignmentMapping {
  if (type === 'agent') return LEGACY_ROLE_MAP['4'] as AssignmentMapping;

  const key = String(Number.parseInt(String(role), 10));
  return (LEGACY_ROLE_MAP[key] ?? LEGACY_ROLE_MAP['3']) as AssignmentMapping;
}

/* ------------------------------------------------------------------ */
/* permission_dimensions -> permission codes                           */
/* ------------------------------------------------------------------ */

/**
 * `page` dimension key -> a permission code **that exists in this database**.
 *
 * The obvious targets here would be the canonical `ui.admin.*` codes, and an
 * earlier revision used them. A dry run proved that wrong: production's
 * permissions table contains none of those codes, so all 24 page grants
 * resolved to nothing and would have migrated as silent no-ops — every role
 * losing its page access with no error to explain it.
 *
 * These therefore point at the live vocabulary. Where production has no
 * equivalent the key maps to null and the migration reports it, because a
 * dropped grant must be a visible decision rather than a missing key.
 *
 * Self-service and agent pages are the null cases: they gate an employee's
 * own payslips and profile, which this catalogue never modelled as
 * permissions — that access comes from the numeric role, migrated separately
 * as a SELF-scoped assignment in step 3.
 */
export const PAGE_DIMENSION_MAP: Readonly<Record<string, string | null>> = {
  dashboard: 'dashboard.hr.view',
  employees: 'employees.view',
  appointments: 'appointments.view',
  salary: 'salary slips.view',
  attendance: 'dashboard.attendance.view',
  reports: 'reports.view',
  // Form 16 is generated from payslip data and has no permission of its own.
  form16: 'salary slips.view',
  admin_management: 'security.users.manage',
  rbac_dashboard: 'roles & permissions.view',
  rbac_users: 'security.users.manage',
  rbac_permission_matrix: 'roles & permissions.edit',
  rbac_audit_logs: 'company.audit',
  'appointments.view_full_aadhaar': 'appointments.view_full_aadhaar',

  // No equivalent in the live catalogue — reported, not dropped silently.
  trial_form: null,
  employee_payslips: null,
  employee_form16: null,
  employee_profile: null,
  employee_dashboard: null,
  employee_appointment: null,
  agent_dashboard: null,
  agent_trial_form: null,
  agent_appointment_form: null,
};

export type DimensionValue = 'read_write' | 'view_only' | 'no_access';

/**
 * Translate a dimension value into an effect.
 *
 * `view_only` is the interesting one: it grants the read code and explicitly
 * denies the mutating codes in the same resource. Migrating it as a plain
 * ALLOW would quietly widen access for every role that holds it.
 */
export function dimensionEffect(value: string): { effect: 'ALLOW' | 'DENY'; readOnly: boolean } {
  switch (value) {
    case 'read_write':
      return { effect: 'ALLOW', readOnly: false };
    case 'view_only':
      return { effect: 'ALLOW', readOnly: true };
    case 'no_access':
    default:
      return { effect: 'DENY', readOnly: false };
  }
}

/** Mutating codes implied by a resource, used to expand a `view_only` grant. */
export function mutatingSiblings(code: string): string[] {
  const base = code.replace(/\.[^.]+$/, '');
  return ['create', 'update', 'delete', 'import', 'approve'].map((action) => `${base}.${action}`);
}
