import {
  DEFAULT_COMPANY_ID,
  ALL_COMPANY_ID,
  getCompanyAddressLines,
  getCompanyConfig,
  resolveCompanyId,
} from "../config/companyConfig";

export const COMPANY_DETAILS = getCompanyConfig(DEFAULT_COMPANY_ID);

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function firstPresent(...values) {
  return values.find(
    (value) => value !== undefined && value !== null && value !== "",
  );
}

function readNumber(...values) {
  const value = firstPresent(...values);
  return Number(value ?? 0);
}

function splitAmount(total, ratios) {
  const safeTotal = Math.max(0, Math.round(Number(total || 0)));
  let remaining = safeTotal;

  return ratios.map((ratio, index) => {
    if (index === ratios.length - 1) return remaining;

    const value = Math.round(safeTotal * ratio);
    remaining -= value;
    return value;
  });
}

export function parseMonthYear(monthStr) {
  const today = new Date();
  const [name, yearPart] = (monthStr || "").split(" ");
  const monthIndex = MONTH_NAMES.indexOf(name);
  const year = Number.parseInt(yearPart, 10) || today.getFullYear();
  const safeIndex = monthIndex >= 0 ? monthIndex : today.getMonth();
  const lastDay = new Date(year, safeIndex + 1, 0).getDate();

  return {
    idx: safeIndex,
    year,
    short: MONTH_SHORT[safeIndex],
    num: String(safeIndex + 1).padStart(2, "0"),
    lastDay,
  };
}

export function formatMoneyValue(amount) {
  return Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatCurrency(amount) {
  return `Rs. ${formatMoneyValue(amount)}`;
}

export function formatDate(dateString) {
  if (!dateString) return "-";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function numberToWords(n) {
  if (n === 0) return "Zero";

  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];

  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  const twoDigits = (value) =>
    value < 20
      ? ones[value]
      : `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${ones[value % 10]}` : ""}`;

  const threeDigits = (value) =>
    value >= 100
      ? `${ones[Math.floor(value / 100)]} Hundred${value % 100 ? ` ${twoDigits(value % 100)}` : ""}`
      : twoDigits(value);

  let remaining = Math.round(Number(n || 0));
  let result = "";

  if (remaining >= 10000000) {
    result += `${threeDigits(Math.floor(remaining / 10000000))} Crore `;
    remaining %= 10000000;
  }

  if (remaining >= 100000) {
    result += `${threeDigits(Math.floor(remaining / 100000))} Lakh `;
    remaining %= 100000;
  }

  if (remaining >= 1000) {
    result += `${threeDigits(Math.floor(remaining / 1000))} Thousand `;
    remaining %= 1000;
  }

  if (remaining > 0) {
    result += threeDigits(remaining);
  }

  return result.trim();
}

export function resolvePayslipCompanyId({
  emp = {},
  payslip = {},
  companyId,
} = {}) {
  if (companyId === ALL_COMPANY_ID) {
    return resolveCompanyId(
      payslip.companyId,
      payslip.company_code,
      payslip.company,
      emp.companyId,
      emp.company_code,
      emp.company,
    );
  }

  return resolveCompanyId(
    companyId,
    payslip.companyId,
    payslip.company_code,
    payslip.company,
    emp.companyId,
    emp.company_code,
    emp.company,
  );
}

export function buildPayslipData({ emp = {}, payslip = {}, companyId } = {}) {
  const resolvedCompanyId = resolvePayslipCompanyId({ emp, payslip, companyId });
  const companyConfig = getCompanyConfig(resolvedCompanyId);
  const month = payslip.month || "April 2025";
  const { short, year, num, lastDay } = parseMonthYear(month);

  const basicSalary = readNumber(
    payslip.basicSalary,
    payslip.basic,
    emp.basicSalary,
    emp.basic,
  );
  const bonus = readNumber(
    payslip.bonus,
    payslip.product_incentive,
    emp.bonus,
    emp.product_incentive,
  );

  // Use actual per-component values from API when present, otherwise ratio-split lump-sum
  let dailyAllowance,
    hra,
    wa,
    conveyanceAllowance,
    educationAllowance,
    medicalAllowance,
    mobileAllowance;
  const hasExplicitAllowanceBreakdown = [
    payslip.da,
    payslip.hra,
    payslip.wa,
    payslip.conveyance,
    payslip.conv_a,
    payslip.con_al,
    payslip.education,
    payslip.edu_a,
    payslip.medical,
    payslip.med_a,
    payslip.mob_a,
    payslip.bonus,
    payslip.product_incentive,
  ].some((value) => value != null);

  if (hasExplicitAllowanceBreakdown) {
    dailyAllowance = readNumber(payslip.da);
    hra = readNumber(payslip.hra);
    wa = readNumber(payslip.wa);
    conveyanceAllowance = readNumber(
      payslip.conveyance,
      payslip.conv_a,
      payslip.con_al,
    );
    educationAllowance = readNumber(payslip.education, payslip.edu_a);
    medicalAllowance = readNumber(payslip.medical, payslip.med_a);
    mobileAllowance = readNumber(payslip.mobileAllowance, payslip.mob_a);
  } else {
    const allowances = Number(payslip.allowances ?? emp.allowances ?? 0);
    [
      dailyAllowance,
      hra,
      conveyanceAllowance,
      educationAllowance,
      medicalAllowance,
    ] = splitAmount(allowances, [0.36, 0.28, 0.1, 0.08, 0.18]);
    wa = 0;
    mobileAllowance = 0;
  }

  const computedGrossSalary =
    basicSalary +
    dailyAllowance +
    hra +
    wa +
    conveyanceAllowance +
    educationAllowance +
    medicalAllowance +
    mobileAllowance +
    bonus;
  const grossSalary =
    readNumber(payslip.grossSalary, payslip.gross_salary) ||
    computedGrossSalary;

  const inferredDeductions = Math.max(
    0,
    grossSalary -
      readNumber(
        payslip.amount,
        payslip.netSalary,
        payslip.net_payable,
        grossSalary,
      ),
  );

  const deductionTotal = readNumber(
    payslip.deductions,
    payslip.total_deduct,
    emp.deductions,
    inferredDeductions,
  );

  // Use actual per-component deduction values from API when present, otherwise ratio-split
  let professionalTax, providentFund, esiAmount, tds, lwf, advance;
  const hasExplicitDeductionBreakdown =
    payslip.pt != null ||
    payslip.pf != null ||
    payslip.esi != null ||
    payslip.tds != null ||
    payslip.lwf != null ||
    payslip.advance != null;

  if (hasExplicitDeductionBreakdown) {
    professionalTax = readNumber(payslip.pt);
    providentFund = readNumber(payslip.pf);
    esiAmount = readNumber(payslip.esi);
    tds = readNumber(payslip.tds);
    lwf = readNumber(payslip.lwf);
    advance = readNumber(payslip.advance);
  } else {
    [professionalTax, providentFund, tds] =
      deductionTotal <= 300
        ? [deductionTotal, 0, 0]
        : splitAmount(deductionTotal, [0.12, 0.58, 0.3]);
    esiAmount = 0;
    lwf = 0;
    advance = 0;
  }

  const earningRows = [
    { label: "BASIC", amount: basicSalary },
    { label: "DAILY ALLOWANCE", amount: dailyAllowance },
    { label: "HRA", amount: hra },
    { label: "Conv.A", amount: conveyanceAllowance },
    { label: "Edu.A", amount: educationAllowance },
    { label: "Med.A", amount: medicalAllowance },
    { label: "Prod. Ince.", amount: bonus },
  ];

  const deductionRows = [
    { label: "PROFESSIONAL TAX", amount: professionalTax },
    { label: "PF", amount: providentFund },
    { label: "ESI AMOUNT", amount: esiAmount },
    { label: "TDS", amount: tds },
    { label: "LWF", amount: lwf },
    { label: "ADVANCE", amount: advance },
  ];

  const totalEarnings = grossSalary || earningRows.reduce((sum, row) => sum + row.amount, 0);
  const totalDeductions =
    readNumber(payslip.totalDeductions, payslip.total_deduct) ||
    deductionRows.reduce((sum, row) => sum + row.amount, 0);
  const netPay = readNumber(
    payslip.amount,
    payslip.netSalary,
    payslip.net_payable,
    totalEarnings - totalDeductions,
  );

  const totalPaidDays = readNumber(
    payslip.totalPaidDays,
    payslip.paid_day,
    emp.totalPaidDays,
    emp.paid_day,
    26,
  );
  const lwp = readNumber(
    payslip.leave,
    payslip.lwp,
    emp.leave,
    emp.lwp,
    0,
  );
  const netPaidDays = readNumber(
    payslip.netPaidDays,
    emp.netPaidDays,
    Math.max(0, totalPaidDays - lwp),
  );
  const employeeName = firstPresent(emp.name, payslip.name, payslip.emp_name, "Employee");
  const employeeUnit = firstPresent(emp.unit, payslip.unit, payslip.branch, "-");
  const company = {
    ...companyConfig,
    addressLines: getCompanyAddressLines(resolvedCompanyId, employeeUnit),
  };

  return {
    company,
    companyId: resolvedCompanyId,
    month,
    monthLabel: `${short}-${year}`,
    dateFrom: `01/${num}/${year}`,
    dateTo: `${String(lastDay).padStart(2, "0")}/${num}/${year}`,
    payDate: payslip.date || payslip.payDate || payslip.pay_date || "",
    employee: {
      name: employeeName,
      nameUpper: employeeName.toUpperCase(),
      empCode: firstPresent(emp.empCode, emp.emp_code, payslip.empCode, payslip.emp_code, "-"),
      bankAccount: firstPresent(
        emp.bankAccount,
        emp.bank_account,
        payslip.bankAccount,
        payslip.bank_account,
        payslip.account_no,
        "-",
      ),
      bankName: firstPresent(
        emp.bankName,
        emp.bank_name,
        payslip.bankName,
        payslip.bank_name,
        payslip.accountName,
        payslip.account_name,
        "-",
      ),
      accountName: firstPresent(
        emp.accountName,
        emp.account_name,
        payslip.accountName,
        payslip.account_name,
        "-",
      ),
      bankIfsc: firstPresent(
        emp.bankIfsc,
        emp.bank_ifsc,
        payslip.bankIfsc,
        payslip.bank_ifsc,
        "-",
      ),
      uan: firstPresent(
        emp.uan,
        payslip.uan,
        payslip.pfUan,
        payslip.pf_uan,
        "-",
      ),
      esiAccountNo: firstPresent(
        emp.esiNo,
        emp.esi_no,
        payslip.esiNo,
        payslip.esi_no,
        "-",
      ),
      mobile: firstPresent(
        emp.phone,
        emp.mobile,
        emp.mobile_no,
        payslip.phone,
        payslip.mobile,
        payslip.mobileNo,
        payslip.mobile_no,
        "-",
      ),
      designation: firstPresent(
        emp.role,
        emp.designation,
        payslip.role,
        payslip.designation,
        "-",
      ),
      mainDepartment: firstPresent(
        emp.mainDepartment,
        emp.main_department,
        payslip.mainDepartment,
        payslip.main_department,
        "-",
      ),
      department: firstPresent(
        emp.department,
        payslip.department,
        emp.mainDepartment,
        emp.main_department,
        payslip.mainDepartment,
        payslip.main_department,
        "-",
      ),
      unit: employeeUnit,
      monthDays: lastDay,
      workingDays: totalPaidDays,
      totalPaidDays,
      lwp,
      netPaidDays,
    },
    attendance: {
      monthDays: lastDay,
      workingDays: totalPaidDays,
      lwp,
      netPaidDays,
    },
    components: {
      basicSalary,
      dailyAllowance,
      hra,
      wa,
      conveyanceAllowance,
      educationAllowance,
      medicalAllowance,
      mobileAllowance,
      bonus,
      aGross: readNumber(payslip.aGross, payslip.a_gross),
      grossSalary,
      professionalTax,
      providentFund,
      esiAmount,
      tds,
      lwf,
      advance,
    },
    earningRows,
    deductionRows,
    rowCount: Math.max(earningRows.length, deductionRows.length, 7),
    totals: {
      earnings: totalEarnings,
      deductions: totalDeductions,
      netPay,
      salaryCredited: netPay,
    },
    netPayInWords: `${numberToWords(netPay)} Only`,
  };
}
