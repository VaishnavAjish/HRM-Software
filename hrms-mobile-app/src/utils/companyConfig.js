// Mirrors src/config/companyConfig.js on the web app — company codes and
// their unit lists are hardcoded there too, not fetched from an API.
export const COMPANY_OPTIONS = [
  { value: 'nidhi-impex', label: 'Nidhi Impex' },
  { value: 'silver-star', label: 'Silver Star' },
];

const COMPANY_UNITS = {
  'nidhi-impex': ['Shreeji', 'Ichapur'],
  'silver-star': ['Daduk', 'Ichapur'],
};

export function getCompanyUnits(companyCode) {
  return COMPANY_UNITS[companyCode] || [];
}

export function resolveWriteCompanyId(value) {
  if (!value || value === 'all' || value === 'all-companies') return '';
  return value;
}
