/**
 * Build-time feature flags.
 *
 * These only decide what the UI offers. Every flag here has a server-side
 * counterpart that is the actual enforcement — a user who flips a bundled
 * constant in their own browser gains nothing, because the endpoint checks the
 * same switch and returns 503 when it is off.
 */

/**
 * Confidential (full-Aadhaar) Print and PDF export.
 *
 * Off unless VITE_CONFIDENTIAL_AADHAAR_EXPORT_ENABLED is exactly "true", so a
 * missing or misspelled variable keeps it closed rather than open. Must be kept
 * in step with CONFIDENTIAL_AADHAAR_EXPORT_ENABLED on the backend; while the two
 * disagree the stricter one wins, which is the correct failure direction.
 */
export function confidentialAadhaarExportEnabled() {
  return (
    String(import.meta.env?.VITE_CONFIDENTIAL_AADHAAR_EXPORT_ENABLED ?? "") ===
    "true"
  );
}
