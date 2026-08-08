export function normaliseAadhaar(value) {
  return String(value || '').replace(/\D/g, '');
}

export function isCompleteAadhaar(value) {
  return normaliseAadhaar(value).length === 12;
}

export function formatAadhaarInput(value) {
  const digits = normaliseAadhaar(value).slice(0, 12);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function formatFullAadhaar(value) {
  const digits = normaliseAadhaar(value);
  if (digits.length !== 12) return '-';
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}
