import { isPhotoDeletedOrDummy } from "./photoStatus";

/**
 * Calculates profile completion percentage score (0 - 100%) for an employee record based on required core profile fields.
 */
export function getProfileCompletionPercentage(u) {
  if (!u) return 0;
  const target = u.employee || u.user || u.profile || u;

  const checks = [
    Boolean(target.name || target.displayName),
    Boolean(
      (target.phone && String(target.phone).trim()) ||
      (target.mobile_number && String(target.mobile_number).trim()) ||
      (target.mobileNo && String(target.mobileNo).trim()) ||
      (target.email && String(target.email).trim())
    ),
    Boolean(target.dob && String(target.dob).trim() && String(target.dob) !== "-"),
    Boolean(
      (target.address && String(target.address).trim() && String(target.address) !== "-") ||
      (target.city && String(target.city).trim() && String(target.city) !== "-") ||
      (target.district && String(target.district).trim() && String(target.district) !== "-")
    ),
    Boolean(target.gender && String(target.gender).trim() && String(target.gender) !== "-"),
    Boolean(
      target.hasAadhaar ||
      target.has_aadhaar ||
      (target.aadharCardNo && String(target.aadharCardNo).trim() && String(target.aadharCardNo) !== "-") ||
      (target.aadhar_card_no && String(target.aadhar_card_no).trim() && String(target.aadhar_card_no) !== "-") ||
      (target.aadhaar_card_no && String(target.aadhaar_card_no).trim() && String(target.aadhaar_card_no) !== "-")
    ),
    Boolean(
      (target.panCardNo && String(target.panCardNo).trim() && String(target.panCardNo) !== "-") ||
      (target.pan_card_no && String(target.pan_card_no).trim() && String(target.pan_card_no) !== "-") ||
      (target.pan_no && String(target.pan_no).trim() && String(target.pan_no) !== "-")
    ),
    Boolean(
      (target.bankName && String(target.bankName).trim() && String(target.bankName) !== "-") ||
      (target.bank_name && String(target.bank_name).trim() && String(target.bank_name) !== "-")
    ),
    Boolean(
      (target.bankAccountNo && String(target.bankAccountNo).trim() && String(target.bankAccountNo) !== "-") ||
      (target.bank_account_no && String(target.bank_account_no).trim() && String(target.bank_account_no) !== "-") ||
      (target.account_no && String(target.account_no).trim() && String(target.account_no) !== "-")
    ),
    Boolean(
      (target.bankIfscCode && String(target.bankIfscCode).trim() && String(target.bankIfscCode) !== "-") ||
      (target.bank_ifsc_code && String(target.bank_ifsc_code).trim() && String(target.bank_ifsc_code) !== "-") ||
      (target.ifsc_code && String(target.ifsc_code).trim() && String(target.ifsc_code) !== "-")
    ),
  ];

  const filled = checks.filter(Boolean).length;
  let pct = Math.round((filled / checks.length) * 100);

  // If photo is flagged as deleted or dummy photo detected, cap/deduct profile completion score
  if (isPhotoDeletedOrDummy(u)) {
    pct = Math.min(pct, 90);
  }

  return pct;
}

export function isEmployeeProfileComplete(u) {
  if (!u) return false;
  if (isPhotoDeletedOrDummy(u)) return false;
  return getProfileCompletionPercentage(u) === 100;
}
