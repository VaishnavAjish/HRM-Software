/**
 * Who may manage roles, for interface rendering only.
 *
 * This is a user-experience control and nothing more. Every role mutation is
 * independently authorised by the server (RequireSuperAdmin middleware), so a
 * caller who edits this value, forges localStorage, or calls the API directly
 * still gets a 403. Hiding a button is not a security boundary; it is there so
 * an unauthorised user is not shown an action that can only fail.
 *
 * Identity comes from the numeric role, never the display name. "Super Admin"
 * is editable text — a role renamed to it grants nothing, and the real super
 * administrator renamed to something else keeps its access. `is_super_admin`
 * stays server-side (User::$hidden), so rawRole 0 is the signal available here,
 * and it is the same one AuthContext already uses to grant the "*" permission.
 */
export function isSuperAdminUser(user) {
  return Number(user?.rawRole) === 0 || user?.isSuperAdmin === true;
}

/**
 * May this user reach the role-management surface at all?
 *
 * Two tiers manage roles: the hidden super administrator and the administrator.
 * Everyone below manages nothing. This mirrors RoleHierarchy on the server,
 * which is the authority — the server narrows both the list and every mutation
 * by tier, so a stale or edited value here changes what is drawn and nothing
 * about what is permitted.
 */
export function canManageRoles(user) {
  return isSuperAdminUser(user) || Number(user?.rawRole) === 1;
}

/**
 * Only the super administrator manages the Admin tier.
 *
 * The server never returns Admin rows to an administrator, so this mainly
 * governs which role types the create form offers.
 */
export function canManageAdminTier(user) {
  return isSuperAdminUser(user);
}
