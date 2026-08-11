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
 * The answer is a permission, not a tier. This read `rawRole === 1`, which is
 * the legacy numeric tier — and tierForCode() maps every role code it does not
 * recognise onto the employee tier, so the value says nothing about the role.
 * Now that the Permission Matrix decides which shell an account enters, a
 * business role can be drawn in the management frame, and a tier check there
 * would either hand it role management or refuse a genuine administrator whose
 * grant was removed. Neither follows the matrix.
 *
 * ui.access_control.roles is the node the matrix edits, and it implies
 * admin.role.read, which is what the API already enforces — so the button and
 * the endpoint answer from one decision. Ancestors are honoured, so a role
 * holding it under a denied ui.access_control does not qualify.
 *
 * The hidden super administrator is exempt by identity, as everywhere else.
 * RoleHierarchy on the server remains the authority: this only decides what is
 * drawn, and every mutation is still narrowed by tier server-side.
 */
export function canManageRoles(user, can) {
  if (isSuperAdminUser(user)) {
    return true;
  }

  return typeof can === "function" && can("ui.access_control.roles");
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
