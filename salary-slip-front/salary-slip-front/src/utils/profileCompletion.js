/**
 * Evaluates whether an employee's profile details are complete.
 * 
 * PF number (pf_no) and ESI number (esi_no) are explicitly OPTIONAL.
 * HR-managed fields (department, designation, joining_date) are also excluded.
 * 
 * Required employee fields:
 * - Full Name
 * - Phone / Mobile number or Email
 * - Date of Birth (dob)
 * - Address (or city/district)
 * - Gender
 * - Aadhaar Card Number
 * - PAN Card Number
 * - Bank Name
 * - Bank Account Number
 * - Bank IFSC Code
 * - At least one Family Details entry (name + relation)
 */
export function isEmployeeProfileComplete(u) {
  if (!u) return true;

  const target = u.employee || u.user || u.profile || u;

  // Only enforce profile completion for Employee portal users
  const isEmp = target.role === "employee" || (!target.role && target.rawRole !== 0 && target.rawRole !== 1 && target.rawRole !== 3);
  if (!isEmp) return true;

  const hasName = Boolean(target.name && String(target.name).trim());
  const hasContact = Boolean(
    (target.phone && String(target.phone).trim()) ||
    (target.mobile_number && String(target.mobile_number).trim()) ||
    (target.email && String(target.email).trim())
  );
  const hasDob = Boolean(target.dob && String(target.dob).trim());
  const hasAddress = Boolean(
    (target.address && String(target.address).trim()) ||
    (target.city && String(target.city).trim()) ||
    (target.district && String(target.district).trim())
  );
  const hasGender = Boolean(target.gender && String(target.gender).trim());

  const hasAadhaar = Boolean(
    target.has_aadhaar ||
    (target.aadhar_card_no && String(target.aadhar_card_no).trim()) ||
    (target.aadhaar_card_no && String(target.aadhaar_card_no).trim()) ||
    (target.adhar_card_no && String(target.adhar_card_no).trim()) ||
    (target.adhar_no && String(target.adhar_no).trim())
  );

  const hasPan = Boolean(
    (target.pan_card_no && String(target.pan_card_no).trim()) ||
    (target.pan_no && String(target.pan_no).trim())
  );

  const hasBankName = Boolean(target.bank_name && String(target.bank_name).trim());
  const hasBankAccount = Boolean(
    (target.bank_account_no && String(target.bank_account_no).trim()) ||
    (target.account_no && String(target.account_no).trim())
  );
  const hasBankIfsc = Boolean(
    (target.bank_ifsc_code && String(target.bank_ifsc_code).trim()) ||
    (target.ifsc_code && String(target.ifsc_code).trim())
  );

  let familyMembers = target.family_members;
  if (typeof familyMembers === "string") {
    try {
      familyMembers = JSON.parse(familyMembers);
    } catch {
      familyMembers = [];
    }
  }

  const hasFamily = Array.isArray(familyMembers) && familyMembers.some(
    (m) => m && String(m.name || "").trim() && String(m.relation || "").trim()
  );

  return (
    hasName &&
    hasContact &&
    hasDob &&
    hasAddress &&
    hasGender &&
    hasAadhaar &&
    hasPan &&
    hasBankName &&
    hasBankAccount &&
    hasBankIfsc &&
    hasFamily
  );
}
