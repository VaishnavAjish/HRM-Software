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

// Matches src/config/companyConfig.js on the web — used to render the same
// letterhead on the mobile payslip PDF.
export const COMPANY_INFO = {
  'nidhi-impex': {
    name: 'NIDHI IMPEX',
    payslipVariant: 'nidhi',
    addressLines: [
      '2ND TO 7TH FLOOR, SY NO. 376 PLOT NO 7 TPS NO. 4, SHREEJI BUILDING,',
      'PURSHOTTAM FARM COMPOUND, OPP. PODDAR ARCADE, VARACHHA ROAD, SURAT-395006 GUJARAT',
    ],
  },
  'silver-star': {
    name: 'SILVER STAR DIAM PRIVATE LIMITED',
    payslipVariant: 'silver-star',
    addressLines: [
      '4TH FLOOR, FP.11, SP.39 TO 42, DHADUK NAGAR, VARACHHA ROAD,',
      'KAPODRA, SURAT-395006, GUJARAT',
    ],
  },
};

export function getCompanyInfo(companyCode) {
  return COMPANY_INFO[companyCode] || COMPANY_INFO['nidhi-impex'];
}

export function resolveWriteCompanyId(value) {
  if (!value || value === 'all' || value === 'all-companies') return '';
  return value;
}
