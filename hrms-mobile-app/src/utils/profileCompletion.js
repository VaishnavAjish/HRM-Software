// Field groups shown/edited on the Profile screen. PF/ESI numbers are
// intentionally excluded from the completion count — not every employee has
// one, so requiring them would make 100% unreachable for some accounts.
export const BASIC_FIELDS = [
  { key: 'email', label: 'Email', keyboardType: 'email-address' },
  { key: 'mobile_number', label: 'Mobile Number', keyboardType: 'phone-pad' },
  { key: 'dob', label: 'Date of Birth', placeholder: 'YYYY-MM-DD' },
  { key: 'gender', label: 'Gender' },
  { key: 'department', label: 'Department' },
  { key: 'designation', label: 'Designation' },
];

export const ADDRESS_FIELDS = [
  { key: 'address', label: 'Full Address', multiline: true },
  { key: 'city', label: 'City' },
  { key: 'district', label: 'District' },
  { key: 'state', label: 'State' },
  { key: 'pin', label: 'PIN Code', keyboardType: 'number-pad' },
];

export const BANK_FIELDS = [
  { key: 'pan_card_no', label: 'PAN Card No', placeholder: 'ABCDE1234F', autoCapitalize: 'characters' },
  { key: 'bank_name', label: 'Bank Name' },
  { key: 'bank_ifsc_code', label: 'Bank IFSC', placeholder: 'SBIN0001234', autoCapitalize: 'characters' },
  { key: 'bank_account_no', label: 'Bank Account No', keyboardType: 'number-pad' },
  { key: 'pf_no', label: 'PF Account No' },
  { key: 'esi_no', label: 'ESI ID No' },
];

export const ALL_FIELDS = [...BASIC_FIELDS, ...ADDRESS_FIELDS, ...BANK_FIELDS];

const OPTIONAL_KEYS = new Set(['pf_no', 'esi_no']);
const REQUIRED_FIELDS = ALL_FIELDS.filter((f) => !OPTIONAL_KEYS.has(f.key));

export function computeProfileCompletion(user) {
  const filled = REQUIRED_FIELDS.filter((f) => (user?.[f.key] ?? '').toString().trim().length > 0).length;
  const percent = REQUIRED_FIELDS.length ? Math.round((filled / REQUIRED_FIELDS.length) * 100) : 100;
  return { percent, isComplete: percent >= 100 };
}
