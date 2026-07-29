export const validatePan = (pan) => {
  if (!pan) return true;
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan.toUpperCase());
};

export const validateAadhaar = (aadhaar) => {
  if (!aadhaar) return true;
  return /^\d{12}$/.test(aadhaar);
};

export const validateIfsc = (ifsc) => {
  if (!ifsc) return true;
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase());
};

export const validateBankAccount = (account) => {
  if (!account) return true;
  return /^\d{9,18}$/.test(account);
};

export const validateMobile = (mobile) => {
  if (!mobile) return true;
  return /^\d{10}$/.test(mobile);
};

export const validatePinCode = (pin) => {
  if (!pin) return true;
  return /^\d{6}$/.test(pin);
};

export const validateEmail = (email) => {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const validateEsi = (esi) => {
  if (!esi) return true;
  return /^\d{17}$/.test(esi);
};

export const validatePf = (pf) => {
  if (!pf) return true;
  return /^[A-Z0-9]{1,22}$/.test(pf.toUpperCase());
};

export const validateEmployeeForm = (form) => {
  const errors = [];

  if (form.panCardNo && !validatePan(form.panCardNo)) {
    errors.push("Invalid PAN Card format (e.g. ABCDE1234F)");
  }
  if (form.aadharCardNo && !validateAadhaar(form.aadharCardNo)) {
    errors.push("Aadhaar must be exactly 12 digits");
  }
  if (form.bankIfscCode && !validateIfsc(form.bankIfscCode)) {
    errors.push("Invalid IFSC Code format (e.g. SBIN0001234)");
  }
  if (form.bankAccountNo && !validateBankAccount(form.bankAccountNo)) {
    errors.push("Bank Account Number must be between 9 and 18 digits");
  }
  if (form.mobileNo && !validateMobile(form.mobileNo)) {
    errors.push("Mobile number must be exactly 10 digits");
  }
  if (form.email && !validateEmail(form.email)) {
    errors.push("Invalid Email format");
  }
  if (form.pin && !validatePinCode(form.pin)) {
    errors.push("PIN code must be exactly 6 digits");
  }
  if (form.esiNo && !validateEsi(form.esiNo)) {
    errors.push("ESI Number must be exactly 17 digits");
  }
  if (form.pfNo && !validatePf(form.pfNo)) {
    errors.push("PF Number should be alphanumeric and up to 22 characters");
  }

  return errors;
};
