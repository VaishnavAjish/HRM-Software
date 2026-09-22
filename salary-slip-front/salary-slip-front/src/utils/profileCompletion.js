import { isPhotoDeletedOrDummy } from "./photoStatus";
import { getEmployeePhotoUrl } from "../pages/admin/AdminModals/employee-helpers";
import { hasStoredAadhaar, normaliseAadhaar } from "./aadhaar";

function isValidField(val) {
  if (val === undefined || val === null) return false;
  const s = String(val).trim();
  return (
    s !== "" &&
    s !== "-" &&
    s !== "0" &&
    s !== "0000" &&
    s !== "null" &&
    s !== "undefined" &&
    s !== "N.A." &&
    s !== "n/a"
  );
}

function hasValidPhoto(u, target) {
  if (isPhotoDeletedOrDummy(u) || isPhotoDeletedOrDummy(target)) return false;
  const rawPhoto = target?.photo || target?.userPhoto || target?.userAvatar || u?.photo;
  if (!rawPhoto) return false;
  const photoUrl = getEmployeePhotoUrl(rawPhoto);
  return Boolean(photoUrl && String(photoUrl).trim() !== "");
}

/**
 * Calculates profile completion percentage score (0 - 100%) for an employee record based on required core profile fields.
 * Note: PF and ESI numbers are explicitly OPTIONAL.
 * Photo, Department, and Designation are REQUIRED for 100% completion.
 */
export function getProfileCompletionPercentage(u) {
  if (!u) return 0;
  const target = u.employee || u.user || u.profile || u;

  const checks = [
    // 1. Name
    Boolean(
      isValidField(target.name) ||
      isValidField(target.displayName)
    ),

    // 2. Contact (Phone or Mobile or Email)
    Boolean(
      (isValidField(target.phone) && normaliseAadhaar(target.phone).length >= 10) ||
      (isValidField(target.mobile_number) && normaliseAadhaar(target.mobile_number).length >= 10) ||
      (isValidField(target.mobileNo) && normaliseAadhaar(target.mobileNo).length >= 10) ||
      isValidField(target.email)
    ),

    // 3. DOB (must be a genuine date, not Excel 0-date artifact 1899-12-29 or 0000-00-00)
    Boolean(
      isValidField(target.dob) &&
      !String(target.dob).startsWith("1899") &&
      !String(target.dob).startsWith("1900") &&
      !String(target.dob).startsWith("0000")
    ),

    // 4. Gender
    Boolean(isValidField(target.gender)),

    // 5. Department
    Boolean(
      isValidField(target.department) ||
      isValidField(target.dept_name)
    ),

    // 6. Designation
    Boolean(
      isValidField(target.designation) ||
      isValidField(target.designation_name) ||
      isValidField(target.positionTitle) ||
      isValidField(target.position)
    ),

    // 7. Address / Location
    Boolean(
      isValidField(target.address) ||
      isValidField(target.city) ||
      isValidField(target.district)
    ),

    // 8. Aadhaar Card No (stored or genuine 12-digit Aadhaar, never placeholder "0")
    Boolean(
      hasStoredAadhaar(target) ||
      hasStoredAadhaar(u) ||
      (isValidField(target.aadharCardNo) && normaliseAadhaar(target.aadharCardNo).length === 12) ||
      (isValidField(target.aadhar_card_no) && normaliseAadhaar(target.aadhar_card_no).length === 12) ||
      (isValidField(target.aadhaar_card_no) && normaliseAadhaar(target.aadhaar_card_no).length === 12) ||
      (isValidField(target.aadhaar_full) && normaliseAadhaar(target.aadhaar_full).length === 12)
    ),

    // 9. PAN Card No (genuine PAN, never placeholder "0")
    Boolean(
      (isValidField(target.panCardNo) && target.panCardNo !== "0") ||
      (isValidField(target.pan_card_no) && target.pan_card_no !== "0") ||
      (isValidField(target.pan_no) && target.pan_no !== "0")
    ),

    // 10. Bank Name
    Boolean(
      isValidField(target.bankName) ||
      isValidField(target.bank_name)
    ),

    // 11. Bank Account No (never placeholder "0")
    Boolean(
      (isValidField(target.bankAccountNo) && target.bankAccountNo !== "0") ||
      (isValidField(target.bank_account_no) && target.bank_account_no !== "0") ||
      (isValidField(target.account_no) && target.account_no !== "0")
    ),

    // 12. Bank IFSC Code
    Boolean(
      isValidField(target.bankIfscCode) ||
      isValidField(target.bank_ifsc_code) ||
      isValidField(target.ifsc_code)
    ),

    // 13. Profile Photo (Required)
    hasValidPhoto(u, target),
  ];

  const filled = checks.filter(Boolean).length;
  let pct = Math.round((filled / checks.length) * 100);

  // If photo is missing or flagged as deleted/dummy, cap score at less than 100%
  if (!hasValidPhoto(u, target)) {
    pct = Math.min(pct, 90);
  }

  return pct;
}

export function isEmployeeProfileComplete(u) {
  if (!u) return false;
  const target = u.employee || u.user || u.profile || u;
  if (!hasValidPhoto(u, target)) return false;
  return getProfileCompletionPercentage(u) === 100;
}
