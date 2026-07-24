export const FORM16_COMPANY_DETAILS = {
  name: "NIDHI IMPEX",
  addressLines: [
    "2ND TO 7TH FLOOR, SY NO. 376 PLOT NO 7 TPS NO,4, SHREEJI BUILDING,",
    "PURSHOTTAM FARM COMPOUND, OPP. PODDAR ARCADE,, VARACHHA ROAD, SURAT-395006 GUJARAT",
  ],
  deductorPan: "AAIFN3857A",
  deductorTan: "SRTN03025B",
  commissioner: "The Commissioner of Income Tax (TDS)",
  signatoryName: "KETANBHAI SAVANI",
  place: "SURAT",
};

const NEW_REGIME_SLABS = [
  { limit: 300000, rate: 0 },
  { limit: 700000, rate: 0.05 },
  { limit: 1000000, rate: 0.1 },
  { limit: 1200000, rate: 0.15 },
  { limit: 1500000, rate: 0.2 },
  { limit: Number.POSITIVE_INFINITY, rate: 0.3 },
];

const OLD_REGIME_SLABS = [
  { limit: 250000, rate: 0 },
  { limit: 500000, rate: 0.05 },
  { limit: 1000000, rate: 0.2 },
  { limit: Number.POSITIVE_INFINITY, rate: 0.3 },
];

function toNumber(value) {
  return Number(value || 0);
}

function roundToNearestHundred(value) {
  return value > 0 ? Math.round(value / 100) * 100 : 0;
}

function calculateSlabTax(income, slabs) {
  let previousLimit = 0;
  let tax = 0;

  for (const slab of slabs) {
    if (income <= previousLimit) break;
    const taxableSlice = Math.min(income, slab.limit) - previousLimit;
    tax += taxableSlice * slab.rate;
    previousLimit = slab.limit;
  }

  return Math.round(tax);
}

function splitQuarterly(total) {
  const safeTotal = Math.round(toNumber(total));
  const q1 = Math.round(safeTotal * 0.25);
  const q2 = Math.round(safeTotal * 0.25);
  const q3 = Math.round(safeTotal * 0.25);
  const q4 = safeTotal - q1 - q2 - q3;

  return [q1, q2, q3, q4];
}

function sumValues(values) {
  return values.reduce((sum, value) => sum + toNumber(value), 0);
}

function formatLongDate(date) {
  const parsed = date ? new Date(date) : new Date();
  const safeDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
    .format(safeDate)
    .replace(/ /g, "-");
}

export function formatForm16Date(date) {
  const parsed = date ? new Date(date) : new Date();
  const safeDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(safeDate);
}

export function formatForm16Amount(value) {
  const amount = toNumber(value);
  if (amount <= 0) return "Nil";

  return amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatForm16AmountWithRs(value) {
  return value > 0 ? `Rs. ${formatForm16Amount(value)}` : "Nil";
}

export function buildForm16DocumentData(emp = {}, fy = "2024-25") {
  const yr = Number.parseInt(fy.split("-")[0], 10);
  const assessmentYear = `${yr + 1}-${String(yr + 2).slice(2)}`;
  const usesNewRegime = emp?.form16?.optOut115BAC === true ? false : true;

  const salary17_1 =
    toNumber(emp.basicSalary) * 12 +
    toNumber(emp.allowances) * 12 +
    toNumber(emp.bonus) * 12;
  const perquisites = toNumber(emp?.form16?.perquisites);
  const profitsInLieu = toNumber(emp?.form16?.profitsInLieu);
  const salaryFromOtherEmployers = toNumber(
    emp?.form16?.salaryFromOtherEmployers,
  );
  const grossSalary = salary17_1 + perquisites + profitsInLieu;

  const section10 = {
    travelConcession: toNumber(emp?.form16?.section10?.travelConcession),
    gratuity: toNumber(emp?.form16?.section10?.gratuity),
    commutedPension: toNumber(emp?.form16?.section10?.commutedPension),
    leaveEncashment: toNumber(emp?.form16?.section10?.leaveEncashment),
    hra: toNumber(emp?.form16?.section10?.hra),
    specialAllowance: toNumber(emp?.form16?.section10?.specialAllowance),
    otherExemption: toNumber(emp?.form16?.section10?.otherExemption),
  };

  const totalSection10 = sumValues(Object.values(section10));

  const deductions16 = {
    standardDeduction: toNumber(
      emp?.form16?.deductions16?.standardDeduction || 75000,
    ),
    entertainmentAllowance: toNumber(
      emp?.form16?.deductions16?.entertainmentAllowance,
    ),
    taxOnEmployment: toNumber(emp?.form16?.deductions16?.taxOnEmployment),
  };

  const totalDeductions16 = sumValues(Object.values(deductions16));
  const incomeFromSalary = Math.max(
    0,
    grossSalary + salaryFromOtherEmployers - totalSection10 - totalDeductions16,
  );

  const otherIncome = {
    houseProperty: toNumber(emp?.form16?.otherIncome?.houseProperty),
    otherSources: toNumber(emp?.form16?.otherIncome?.otherSources),
  };

  const grossTotalIncome = Math.max(
    0,
    incomeFromSalary + otherIncome.houseProperty + otherIncome.otherSources,
  );

  const chapterVIA = {
    section80C: {
      gross: toNumber(emp?.form16?.chapterVIA?.section80C),
      deductible: toNumber(emp?.form16?.chapterVIA?.section80C),
    },
    section80CCC: {
      gross: toNumber(emp?.form16?.chapterVIA?.section80CCC),
      deductible: toNumber(emp?.form16?.chapterVIA?.section80CCC),
    },
    section80CCD1: {
      gross: toNumber(emp?.form16?.chapterVIA?.section80CCD1),
      deductible: toNumber(emp?.form16?.chapterVIA?.section80CCD1),
    },
    section80CCD1B: {
      gross: toNumber(emp?.form16?.chapterVIA?.section80CCD1B),
      deductible: toNumber(emp?.form16?.chapterVIA?.section80CCD1B),
    },
    section80CCD2: {
      gross: toNumber(emp?.form16?.chapterVIA?.section80CCD2),
      deductible: toNumber(emp?.form16?.chapterVIA?.section80CCD2),
    },
    section80D: {
      gross: toNumber(emp?.form16?.chapterVIA?.section80D),
      deductible: toNumber(emp?.form16?.chapterVIA?.section80D),
    },
    section80E: {
      gross: toNumber(emp?.form16?.chapterVIA?.section80E),
      deductible: toNumber(emp?.form16?.chapterVIA?.section80E),
    },
    section80CCHEmp: {
      gross: toNumber(emp?.form16?.chapterVIA?.section80CCHEmp),
      deductible: toNumber(emp?.form16?.chapterVIA?.section80CCHEmp),
    },
    section80CCHGovt: {
      gross: toNumber(emp?.form16?.chapterVIA?.section80CCHGovt),
      deductible: toNumber(emp?.form16?.chapterVIA?.section80CCHGovt),
    },
    section80G: {
      gross: toNumber(emp?.form16?.chapterVIA?.section80G?.gross),
      qualifying: toNumber(emp?.form16?.chapterVIA?.section80G?.qualifying),
      deductible: toNumber(emp?.form16?.chapterVIA?.section80G?.deductible),
    },
    section80TTA: {
      gross: toNumber(emp?.form16?.chapterVIA?.section80TTA?.gross),
      qualifying: toNumber(emp?.form16?.chapterVIA?.section80TTA?.qualifying),
      deductible: toNumber(emp?.form16?.chapterVIA?.section80TTA?.deductible),
    },
    otherVIA: {
      gross: toNumber(emp?.form16?.chapterVIA?.otherVIA?.gross),
      qualifying: toNumber(emp?.form16?.chapterVIA?.otherVIA?.qualifying),
      deductible: toNumber(emp?.form16?.chapterVIA?.otherVIA?.deductible),
    },
  };

  const aggregateChapterVIA = sumValues([
    chapterVIA.section80C.deductible,
    chapterVIA.section80CCC.deductible,
    chapterVIA.section80CCD1.deductible,
    chapterVIA.section80CCD1B.deductible,
    chapterVIA.section80CCD2.deductible,
    chapterVIA.section80D.deductible,
    chapterVIA.section80E.deductible,
    chapterVIA.section80CCHEmp.deductible,
    chapterVIA.section80CCHGovt.deductible,
    chapterVIA.section80G.deductible,
    chapterVIA.section80TTA.deductible,
    chapterVIA.otherVIA.deductible,
  ]);

  const taxableIncome = roundToNearestHundred(
    Math.max(0, grossTotalIncome - aggregateChapterVIA),
  );
  const baseTax = usesNewRegime
    ? calculateSlabTax(taxableIncome, NEW_REGIME_SLABS)
    : calculateSlabTax(taxableIncome, OLD_REGIME_SLABS);
  const rebate87A = usesNewRegime
    ? taxableIncome <= 700000
      ? baseTax
      : 0
    : taxableIncome <= 500000
      ? baseTax
      : 0;
  const surcharge = toNumber(emp?.form16?.tax?.surcharge);
  const taxAfterRebate = Math.max(0, baseTax - rebate87A);
  const cess = Math.round((taxAfterRebate + surcharge) * 0.04);
  const totalTax = taxAfterRebate + surcharge + cess;
  const relief89 = toNumber(emp?.form16?.tax?.relief89);
  const taxCollected12BAA = toNumber(emp?.form16?.tax?.taxCollected12BAA);
  const currentEmploymentTDS = toNumber(
    emp?.form16?.tax?.currentEmploymentTDS ?? totalTax,
  );
  const previousEmploymentTDS = toNumber(
    emp?.form16?.tax?.previousEmploymentTDS,
  );
  const netTaxPayable = Math.max(0, totalTax - relief89 - taxCollected12BAA);
  const totalTaxDeducted = currentEmploymentTDS + previousEmploymentTDS;
  const balancePayableOrRefundable = netTaxPayable - totalTaxDeducted;

  const quarterlySalary = splitQuarterly(salary17_1);
  const quarterlyTDS = splitQuarterly(currentEmploymentTDS);

  const quarterRows = [
    {
      quarter: "Q1",
      period: `Apr ${yr} - Jun ${yr}`,
      amountPaid: quarterlySalary[0],
      tdsDeducted: quarterlyTDS[0],
      tdsDeposited: quarterlyTDS[0],
      receiptNumber: "",
      depositDate: `07/07/${yr}`,
    },
    {
      quarter: "Q2",
      period: `Jul ${yr} - Sep ${yr}`,
      amountPaid: quarterlySalary[1],
      tdsDeducted: quarterlyTDS[1],
      tdsDeposited: quarterlyTDS[1],
      receiptNumber: "",
      depositDate: `07/10/${yr}`,
    },
    {
      quarter: "Q3",
      period: `Oct ${yr} - Dec ${yr}`,
      amountPaid: quarterlySalary[2],
      tdsDeducted: quarterlyTDS[2],
      tdsDeposited: quarterlyTDS[2],
      receiptNumber: "",
      depositDate: `07/01/${yr + 1}`,
    },
    {
      quarter: "Q4",
      period: `Jan ${yr + 1} - Mar ${yr + 1}`,
      amountPaid: quarterlySalary[3],
      tdsDeducted: quarterlyTDS[3],
      tdsDeposited: quarterlyTDS[3],
      receiptNumber: "",
      depositDate: `07/04/${yr + 1}`,
    },
  ];

  return {
    fy,
    yr,
    assessmentYear,
    financialYear: fy,
    issueDate: formatLongDate(),
    company: FORM16_COMPANY_DETAILS,
    employee: {
      name: emp.name || "Employee",
      nameUpper: (emp.name || "Employee").toUpperCase(),
      empCode: emp.empCode || "-",
      role: emp.role || "-",
      department: emp.department || "-",
      pan: emp.pan || emp?.form16?.pan || "ABCDE1234F",
      referenceNo:
        emp.employeeReferenceNo || emp?.form16?.employeeReferenceNo || "-",
    },
    employmentPeriod: {
      from: `01-Apr-${yr}`,
      to: `31-Mar-${yr + 1}`,
    },
    partA: {
      certificateNo: emp?.form16?.certificateNo || "__________",
      lastUpdated: emp?.form16?.lastUpdated || "__/__/____",
      commissioner: FORM16_COMPANY_DETAILS.commissioner,
      quarterRows,
      totalAmountPaid: salary17_1,
      totalTaxDeducted: currentEmploymentTDS,
      totalTaxDeposited: currentEmploymentTDS,
    },
    partB: {
      optingOut115BAC: usesNewRegime ? "NO" : "YES",
      salary17_1,
      perquisites,
      profitsInLieu,
      grossSalary,
      salaryFromOtherEmployers,
      section10,
      totalSection10,
      deductions16,
      totalDeductions16,
      incomeFromSalary,
      otherIncome,
      grossTotalIncome,
      chapterVIA,
      aggregateChapterVIA,
      taxableIncome,
      baseTax,
      rebate87A,
      surcharge,
      cess,
      totalTax,
      relief89,
      taxCollected12BAA,
      netTaxPayable,
      currentEmploymentTDS,
      previousEmploymentTDS,
      totalTaxDeducted,
      balancePayableOrRefundable,
    },
    summary: {
      grossSalary,
      taxableIncome,
      totalTax,
      currentEmploymentTDS,
      balancePayableOrRefundable,
    },
  };
}
