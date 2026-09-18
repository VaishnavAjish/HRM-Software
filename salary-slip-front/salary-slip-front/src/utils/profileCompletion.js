import { isPhotoDeletedOrDummy } from "./photoStatus";
import { getEmployeePhotoUrl } from "../pages/admin/AdminModals/employee-helpers";

function hasValidPhoto(u, target) {
  if (isPhotoDeletedOrDummy(u)) return false;
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
    Boolean(target.name || target.displayName),

    // 2. Contact (Phone or Mobile or Email)
    Boolean(
      (target.phone && String(target.phone).trim() && String(target.phone) !== "-") ||
      (target.mobile_number && String(target.mobile_number).trim() && String(target.mobile_number) !== "-") ||
      (target.mobileNo && String(target.mobileNo).trim() && String(target.mobileNo) !== "-") ||
      (target.email && String(target.email).trim() && String(target.email) !== "-")
    ),

    // 3. DOB
    Boolean(target.dob && String(target.dob).trim() && String(target.dob) !== "-"),

    // 4. Gender
    Boolean(target.gender && String(target.gender).trim() && String(target.gender) !== "-"),

    // 5. Department
    Boolean(
      (target.department && String(target.department).trim() && String(target.department) !== "-") ||
      (target.dept_name && String(target.dept_name).trim() && String(target.dept_name) !== "-")
    ),

    // 6. Designation
    Boolean(
      (target.designation && String(target.designation).trim() && String(target.designation) !== "-") ||
      (target.designation_name && String(target.designation_name).trim() && String(target.designation_name) !== "-")
    ),

    // 7. Address / Location
    Boolean(
      (target.address && String(target.address).trim() && String(target.address) !== "-") ||
      (target.city && String(target.city).trim() && String(target.city) !== "-") ||
      (target.district && String(target.district).trim() && String(target.district) !== "-")
    ),

    // 8. Aadhaar Card No
    Boolean(
      target.hasAadhaar ||
      target.has_aadhaar ||
      (target.aadharCardNo && String(target.aadharCardNo).trim() && String(target.aadharCardNo) !== "-") ||
      (target.aadhar_card_no && String(target.aadhar_card_no).trim() && String(target.aadhar_card_no) !== "-") ||
      (target.aadhaar_card_no && String(target.aadhaar_card_no).trim() && String(target.aadhaar_card_no) !== "-")
    ),

    // 9. PAN Card No
    Boolean(
      (target.panCardNo && String(target.panCardNo).trim() && String(target.panCardNo) !== "-") ||
      (target.pan_card_no && String(target.pan_card_no).trim() && String(target.pan_card_no) !== "-") ||
      (target.pan_no && String(target.pan_no).trim() && String(target.pan_no) !== "-")
    ),

    // 10. Bank Name
    Boolean(
      (target.bankName && String(target.bankName).trim() && String(target.bankName) !== "-") ||
      (target.bank_name && String(target.bank_name).trim() && String(target.bank_name) !== "-")
    ),

    // 11. Bank Account No
    Boolean(
      (target.bankAccountNo && String(target.bankAccountNo).trim() && String(target.bankAccountNo) !== "-") ||
      (target.bank_account_no && String(target.bank_account_no).trim() && String(target.bank_account_no) !== "-") ||
      (target.account_no && String(target.account_no).trim() && String(target.account_no) !== "-")
    ),

    // 12. Bank IFSC Code
    Boolean(
      (target.bankIfscCode && String(target.bankIfscCode).trim() && String(target.bankIfscCode) !== "-") ||
      (target.bank_ifsc_code && String(target.bank_ifsc_code).trim() && String(target.bank_ifsc_code) !== "-") ||
      (target.ifsc_code && String(target.ifsc_code).trim() && String(target.ifsc_code) !== "-")
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
