// Central registry of client storage keys, so logout/denial cleanup is exact.
//
// Pure and import-free so it can be unit-tested under plain Node.
//
// The JWT lives in SecureStore under TOKEN_KEY. Everything else below is
// AsyncStorage. USER_SCOPED_KEYS are derived from the signed-in account and must
// be cleared on logout / invalid token / account denial so a shared device does
// not leak one user's data to the next. DEVICE_ONLY_KEYS are device preferences
// (e.g. the chosen download directory) and must survive logout.

export const TOKEN_KEY = 'hrms_auth_token';

export const DEVICE_ONLY_KEYS = [
  'hrms_pdf_download_dir',
];

export const USER_SCOPED_KEYS = [
  'admin_dashboard_cache',
  'emp_dashboard_cache',
  'hrms_notif_read_local',
  'hrms_notif_dismissed_local',
  'hrms_notif_surfaced',
  // Legacy AsyncStorage session key (token used to live here). Cleared too so an
  // upgrade from the old build leaves nothing behind.
  'hrms_auth_session',
];

/** Keys to remove on logout — user-scoped, never device-only. */
export function userScopedKeysToClear() {
  return USER_SCOPED_KEYS.filter((key) => !DEVICE_ONLY_KEYS.includes(key));
}
