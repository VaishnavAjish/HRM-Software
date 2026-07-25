/* global __COMPANY_MODE__ */

// Injected at build time by vite.config.js based on git branch:
//   branch "nidhi-impex" → "nidhi-impex"
//   branch "silver-star" → "silver-star"
//   branch "master" / anything else → "all"
const COMPANY_MODE =
  typeof __COMPANY_MODE__ !== "undefined" ? __COMPANY_MODE__ : "all";

export const ALL_COMPANY_ID = "all-companies";
export const COMPANY_SCOPE_SEPARATOR = "::";

const NIDHI_IMPEX = {
  id: "nidhi-impex",
  label: "Nidhi Impex",
  sidebarLabel: "Nidhiimpex",
  name: "NIDHI IMPEX",
  initials: "NI",
  logo: "/nidhi_impex_logo.png",
  payslipVariant: "nidhi",
  theme: "amber",
  units: ["Shreeji", "Ichapur"],
  addressLines: [
    "2ND TO 7TH FLOOR, SY NO. 376 PLOT NO 7 TPS NO. 4, SHREEJI BUILDING,",
    "PURSHOTTAM FARM COMPOUND, OPP. PODDAR ARCADE, VARACHHA ROAD, SURAT-395006 GUJARAT",
  ],
  salaryUploadTemplate: {
    fileName: "nidhi_impex_salary_template.xlsx",
    sheetName: "Nidhi Salary",
    headers: [
      "Month",
      "Year",
      "Employee Code",
      "Employee Name",
      "Resignation Date",
      "Working Days",
      "Present Days",
      "Leave",
      "Salary",
      "Basic Salary",
      "HRA",
      "DA",
      "CON.AL",
      "COMM",
      "OTHER",
      "Gross Salary",
      "PF",
      "ESI",
      "PT",
      "TDS",
      "Advance",
      "Total Deduction",
      "Net Salary",
    ],
  },
};

const SILVER_STAR = {
  id: "silver-star",
  label: "Silver Star",
  sidebarLabel: "Silverstar",
  name: "SILVER STAR DIAM PRIVATE LIMITED",
  initials: "SS",
  logo: "/silver_star_logo.png",
  payslipVariant: "silver-star",
  theme: "sky",
  units: ["Daduk", "Ichapur"],
  addressLines: [
    "4TH FLOOR, FP.11, SP.39 TO 42, DHADUK NAGAR, VARACHHA ROAD,",
    "KAPODRA, SURAT-395006, GUJARAT",
  ],
  unitAddressLines: {
    Ichapur: [
      "Plot No K-17,1st To 3rd Floor, Gujarat Hira Bourse Gem & Jewellery Park, Pal Hazira Road,",
      "Gujarat Hira Bourse Admin Office, Ichhapore, Surat, Gujarat, 394510",
    ],
  },
  salaryUploadTemplate: {
    fileName: "silver_star_salary_template.xlsx",
    sheetName: "Silver Star Salary",
    headers: [
      "Month",
      "Year",
      "Employee Code",
      "Employee Name",
      "Resignation Date",
      "Working Days",
      "Present Days",
      "Leave",
      "Salary",
      "Basic Salary",
      "HRA",
      "DA",
      "CON.AL",
      "COMM",
      "OTHER",
      "Gross Salary",
      "PF",
      "ESI",
      "PT",
      "TDS",
      "Advance",
      "Total Deduction",
      "Net Salary",
    ],
  },
};

export const COMPANY_OPTIONS =
  COMPANY_MODE === "nidhi-impex"
    ? [NIDHI_IMPEX]
    : COMPANY_MODE === "silver-star"
      ? [SILVER_STAR]
      : [NIDHI_IMPEX, SILVER_STAR];

export const DEFAULT_COMPANY_ID =
  COMPANY_MODE === "silver-star"
    ? "silver-star"
    : COMPANY_MODE === "nidhi-impex"
      ? "nidhi-impex"
      : "all-companies";

export const ALL_COMPANY_OPTION = {
  id: ALL_COMPANY_ID,
  label: "Both Companies",
  sidebarLabel: "Both Companies",
  name: "ALL COMPANIES",
  initials: "2C",
  logo: null,
  payslipVariant: "nidhi",
  units: [],
  addressLines: [],
  salaryUploadTemplate: null,
};

export const ADMIN_COMPANY_OPTIONS =
  COMPANY_MODE === "all"
    ? [ALL_COMPANY_OPTION, ...COMPANY_OPTIONS]
    : COMPANY_OPTIONS;

const COMPANY_MAP = Object.fromEntries(
  [...COMPANY_OPTIONS, ALL_COMPANY_OPTION].map((company) => [
    company.id,
    company,
  ]),
);

function findCompanyUnit(companyId, value) {
  if (!value) return null;

  const units = COMPANY_MAP[normalizeCompanyId(companyId)]?.units || [];
  const normalizedValue = String(value).trim().toLowerCase();

  return units.find((unit) => unit.toLowerCase() === normalizedValue) || null;
}

export function normalizeCompanyId(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

  if (
    ["nidhi", "nidhi-impex", "nidhiimpex", "nidhi-impex-pvt-ltd"].includes(
      normalized,
    )
  ) {
    return "nidhi-impex";
  }

  if (
    ["silver", "silver-star", "silverstar", "silver-star-jewels"].includes(
      normalized,
    )
  ) {
    return "silver-star";
  }

  if (["all", "both", "all-companies", "both-companies"].includes(normalized)) {
    return ALL_COMPANY_ID;
  }

  return COMPANY_MAP[normalized] ? normalized : DEFAULT_COMPANY_ID;
}

export function getCompanyConfig(value) {
  return COMPANY_MAP[normalizeCompanyId(value)];
}

export function getCompanyUnits(companyId) {
  return getCompanyConfig(companyId)?.units || [];
}

export function getCompanyAddressLines(companyId, unit) {
  const company = getCompanyConfig(companyId);
  const normalizedUnit = findCompanyUnit(companyId, unit);

  if (
    normalizedUnit &&
    Array.isArray(company?.unitAddressLines?.[normalizedUnit]) &&
    company.unitAddressLines[normalizedUnit].length > 0
  ) {
    return company.unitAddressLines[normalizedUnit];
  }

  return company?.addressLines || [];
}

export function resolveCompanyId(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    return normalizeCompanyId(value);
  }

  return DEFAULT_COMPANY_ID;
}

export function resolveCompanyIds(...values) {
  const resolved = [];

  const pushCompany = (value) => {
    const normalized = normalizeCompanyId(value);
    if (normalized === ALL_COMPANY_ID) {
      COMPANY_OPTIONS.forEach((company) => {
        if (!resolved.includes(company.id)) resolved.push(company.id);
      });
      return;
    }

    if (!resolved.includes(normalized)) resolved.push(normalized);
  };

  values.flat().forEach((value) => {
    if (value === undefined || value === null || value === "") return;

    if (Array.isArray(value)) {
      value.forEach(pushCompany);
      return;
    }

    String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach(pushCompany);
  });

  return resolved.length > 0 ? resolved : [DEFAULT_COMPANY_ID];
}

export function buildCompanyScopeKey(companyId, unit) {
  const normalizedCompanyId = resolveCompanyId(companyId);
  const normalizedUnit =
    normalizedCompanyId === ALL_COMPANY_ID
      ? null
      : findCompanyUnit(normalizedCompanyId, unit);

  if (!normalizedUnit) {
    return normalizedCompanyId;
  }

  return `${normalizedCompanyId}${COMPANY_SCOPE_SEPARATOR}${normalizedUnit}`;
}

export function resolveCompanyScope(
  value,
  fallbackCompanyId = DEFAULT_COMPANY_ID,
) {
  let rawCompanyId = fallbackCompanyId;
  let rawUnit = null;

  if (typeof value === "string") {
    const [companyPart, ...unitParts] = String(value || "").split(
      COMPANY_SCOPE_SEPARATOR,
    );

    rawCompanyId = companyPart || fallbackCompanyId;
    rawUnit = unitParts.join(COMPANY_SCOPE_SEPARATOR) || null;
  } else if (value && typeof value === "object") {
    rawCompanyId =
      value.companyId ?? value.company_code ?? value.id ?? fallbackCompanyId;
    rawUnit = value.unit ?? value.branch ?? null;
  } else if (value) {
    rawCompanyId = value;
  }

  const companyId = resolveCompanyId(rawCompanyId || fallbackCompanyId);
  const unit =
    companyId === ALL_COMPANY_ID ? null : findCompanyUnit(companyId, rawUnit);

  return {
    companyId,
    unit,
    scopeKey: buildCompanyScopeKey(companyId, unit),
  };
}

export function getCompanyScopeLabel(scope) {
  const { companyId, unit } = resolveCompanyScope(scope);
  const company = getCompanyConfig(companyId);

  if (companyId === ALL_COMPANY_ID) {
    return company?.label || "Both Companies";
  }

  return unit
    ? `${company?.label || companyId} / ${unit}`
    : company?.label || companyId;
}
