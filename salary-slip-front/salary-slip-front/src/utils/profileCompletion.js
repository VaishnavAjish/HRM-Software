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
 * - Address
 * - Gender
 * - Aadhaar Card Number
 * - PAN Card Number
 * - Bank Name
 * - Bank Account Number
 * - Bank IFSC Code
 */
export function isEmployeeProfileComplete(u) {
  if (!u) return true;

  // Only enforce profile completion for Employee portal users
  const isEmp = u.role === "employee" || (!u.role && u.rawRole !== 0 && u.rawRole !== 1 && u.rawRole !== 3);
  if (!isEmp) return true;

  const hasName = Boolean(u.name && String(u.name).trim());
  const hasContact = Boolean(
    (u.phone && String(u.phone).trim()) ||
    (u.mobile_number && String(u.mobile_number).trim()) ||
    (u.email && String(u.email).trim())
  );
  const hasDob = Boolean(u.dob && String(u.dob).trim());
  const hasAddress = Boolean(
    (u.address && String(u.address).trim()) ||
    (u.city && String(u.city).trim()) ||
    (u.district && String(u.district).trim())
  );
  const hasGender = Boolean(u.gender && String(u.gender).trim());

  const hasAadhaar = Boolean(
    u.has_aadhaar ||
    (u.aadhar_card_no && String(u.aadhar_card_no).trim()) ||
    (u.aadhaar_card_no && String(u.aadhaar_card_no).trim()) ||
    (u.adhar_card_no && String(u.adhar_card_no).trim()) ||
    (u.adhar_no && String(u.adhar_no).trim())
  );

  const hasPan = Boolean(
    (u.pan_card_no && String(u.pan_card_no).trim()) ||
    (u.pan_no && String(u.pan_no).trim())
  );

  const hasBankName = Boolean(u.bank_name && String(u.bank_name).trim());
  const hasBankAccount = Boolean(
    (u.bank_account_no && String(u.bank_account_no).trim()) ||
    (u.account_no && String(u.account_no).trim())
  );
  const hasBankIfsc = Boolean(
    (u.bank_ifsc_code && String(u.bank_ifsc_code).trim()) ||
    (u.ifsc_code && String(u.ifsc_code).trim())
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
    hasBankIfsc
  );
}
