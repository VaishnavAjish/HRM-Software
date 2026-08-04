import { saveJsonToXlsx, downloadCsvFile } from "./excel";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  buildForm16DocumentData,
  FORM16_COMPANY_DETAILS,
  formatForm16Amount,
} from "./form16Utils";
import { buildPayslipData, COMPANY_DETAILS } from "./payslipUtils";

export function downloadExcel(rows, filename) {
  saveJsonToXlsx(`${filename}.xlsx`, "Sheet1", rows);
}

export function downloadCSV(rows, filename) {
  downloadCsvFile(`${filename}.csv`, rows);
}

export function downloadTablePDF({ title, subtitle, columns, rows, filename }) {
  const doc = new jsPDF();
  doc.setFillColor(59, 130, 246);
  doc.rect(0, 0, 210, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, 13);
  if (subtitle) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(subtitle, 14, 19);
  }
  doc.setTextColor(0, 0, 0);
  autoTable(doc, {
    head: [columns],
    body: rows,
    startY: 28,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [239, 246, 255] },
  });
  doc.save(`${filename}.pdf`);
}

// ─── helpers ─────────────────────────────────────────────────────────────────

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

function parseMonthYear(monthStr) {
  // e.g. "April 2025"
  const [name, yr] = (monthStr || "").split(" ");
  const idx = MONTH_NAMES.indexOf(name);
  const year = parseInt(yr) || new Date().getFullYear();
  return {
    idx,
    year,
    short: MONTH_SHORT[idx] ?? name,
    num: String(idx + 1).padStart(2, "0"),
  };
}

function daysInMonth(idx, year) {
  return new Date(year, idx + 1, 0).getDate();
}

function fmtMoney(n) {
  return Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function numberToWords(n) {
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
  function two(x) {
    return x < 20
      ? ones[x]
      : tens[Math.floor(x / 10)] + (x % 10 ? " " + ones[x % 10] : "");
  }
  function three(x) {
    return x >= 100
      ? ones[Math.floor(x / 100)] +
          " Hundred" +
          (x % 100 ? " " + two(x % 100) : "")
      : two(x);
  }
  let r = "",
    x = n;
  if (x >= 10000000) {
    r += three(Math.floor(x / 10000000)) + " Crore ";
    x %= 10000000;
  }
  if (x >= 100000) {
    r += three(Math.floor(x / 100000)) + " Lakh ";
    x %= 100000;
  }
  if (x >= 1000) {
    r += three(Math.floor(x / 1000)) + " Thousand ";
    x %= 1000;
  }
  if (x > 0) {
    r += three(x);
  }
  return r.trim();
}

// ─── Form 16 computation ─────────────────────────────────────────────────────

function legacyComputeForm16Data(emp, fy = "2024-25") {
  const yr = parseInt(fy.split("-")[0]);

  const basic = emp.basicSalary * 12;
  const hra = Math.round(emp.allowances * 0.45) * 12;
  const transport = Math.round(emp.allowances * 0.35) * 12;
  const medical = Math.round(emp.allowances * 0.08) * 12;
  const conveyance = Math.round(emp.allowances * 0.12) * 12;
  const bonus = emp.bonus * 2;

  const grossSalary = basic + hra + transport + medical + conveyance + bonus;

  const hraExempt = Math.min(hra, Math.round(basic * 0.5));
  const standardDeduction = 50000;
  const incomeSalary = grossSalary - hraExempt - standardDeduction;

  const annualPF = Math.round(emp.deductions * 0.5) * 12;
  const deduction80C = Math.min(annualPF, 150000);
  const deduction80D = 15000;
  const totalChapterVIA = deduction80C + deduction80D;

  const taxableIncome = Math.max(0, incomeSalary - totalChapterVIA);

  let tax = 0;
  if (taxableIncome > 1500000) tax = 262500 + (taxableIncome - 1500000) * 0.3;
  else if (taxableIncome > 1000000)
    tax = 112500 + (taxableIncome - 1000000) * 0.2;
  else if (taxableIncome > 500000) tax = 12500 + (taxableIncome - 500000) * 0.2;
  else if (taxableIncome > 250000) tax = (taxableIncome - 250000) * 0.05;
  if (taxableIncome <= 500000) tax = 0;
  tax = Math.round(tax);

  const cess = Math.round(tax * 0.04);
  const totalTax = tax + cess;
  const annualTDS = Math.round(emp.deductions * 0.3) * 12;
  const netTax = totalTax - annualTDS;

  const q = [
    Math.round(annualTDS * 0.25),
    Math.round(annualTDS * 0.25),
    Math.round(annualTDS * 0.25),
  ];
  q.push(annualTDS - q[0] - q[1] - q[2]);

  return {
    fy,
    yr,
    annual: { basic, hra, transport, medical, conveyance, bonus, pf: annualPF },
    grossSalary,
    hraExempt,
    standardDeduction,
    incomeSalary,
    deduction80C,
    deduction80D,
    totalChapterVIA,
    taxableIncome,
    tax,
    cess,
    totalTax,
    annualTDS,
    netTax,
    quarters: [
      { period: `Apr ${yr} – Jun ${yr}`, tds: q[0], deposit: `07/07/${yr}` },
      { period: `Jul ${yr} – Sep ${yr}`, tds: q[1], deposit: `07/10/${yr}` },
      {
        period: `Oct ${yr} – Dec ${yr}`,
        tds: q[2],
        deposit: `07/01/${yr + 1}`,
      },
      {
        period: `Jan ${yr + 1} – Mar ${yr + 1}`,
        tds: q[3],
        deposit: `07/04/${yr + 1}`,
      },
    ],
  };
}

// ─── Form 16 PDF ─────────────────────────────────────────────────────────────

function legacyDownloadForm16PDF({ emp, fy = "2024-25", data: d }) {
  if (!d) d = computeForm16Data(emp, fy);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = 210;
  const ML = 12;
  const CW = PW - ML * 2;

  const fyLabel = `FY ${fy} (AY ${d.yr + 1}-${String(d.yr + 2).slice(2)})`;

  /* ── header bar ── */
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, PW, 26, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(
    "FORM 16 — CERTIFICATE U/S 203 OF INCOME TAX ACT, 1961",
    PW / 2,
    11,
    { align: "center" },
  );
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`For TDS on Salary — ${fyLabel}`, PW / 2, 18, { align: "center" });
  doc.setTextColor(0, 0, 0);

  let y = 32;

  /* ── employer + employee details side by side ── */
  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: ML },
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 2,
      lineColor: [180, 180, 180],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 8,
    },
    head: [["Employer Details", "Employee Details"]],
    body: [
      ["Name: NIDHI IMPEX", `Name: ${emp.name.toUpperCase()}`],
      ["Address: Varachha Road, Surat 395006", `Emp Code: ${emp.empCode}`],
      ["PAN: AABCN1234P", `Designation: ${emp.role}`],
      ["TAN: SRTB12345E", `Department: ${emp.department}`],
      [`Period: 01/04/${d.yr} – 31/03/${d.yr + 1}`, "PAN: ABCDE1234F"],
    ],
    columnStyles: { 0: { cellWidth: CW / 2 }, 1: { cellWidth: CW / 2 } },
  });

  y = doc.lastAutoTable.finalY + 5;

  /* ── PART A ── */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setFillColor(241, 245, 249);
  doc.rect(ML, y, CW, 7, "F");
  doc.text("PART A — DETAILS OF TAX DEDUCTED AT SOURCE", ML + 2, y + 5);
  y += 10;

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: ML },
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 2,
      lineColor: [180, 180, 180],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: "bold",
    },
    head: [
      [
        "Quarter",
        "Period",
        "Amount Paid (₹)",
        "TDS Deducted (₹)",
        "TDS Deposited (₹)",
        "Date of Deposit",
      ],
    ],
    body: [
      ...d.quarters.map((q, i) => [
        `Q${i + 1}`,
        q.period,
        fmtMoney(Math.round(d.annual.basic / 4)),
        fmtMoney(q.tds),
        fmtMoney(q.tds),
        q.deposit,
      ]),
      [
        "",
        "Total",
        fmtMoney(d.annual.basic),
        fmtMoney(d.annualTDS),
        fmtMoney(d.annualTDS),
        "",
      ],
    ],
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
    didParseCell(data) {
      if (data.row.index === d.quarters.length)
        data.cell.styles.fontStyle = "bold";
    },
  });

  y = doc.lastAutoTable.finalY + 5;

  /* ── PART B ── */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setFillColor(241, 245, 249);
  doc.rect(ML, y, CW, 7, "F");
  doc.text(
    "PART B — DETAILS OF SALARY PAID AND TAX COMPUTATION",
    ML + 2,
    y + 5,
  );
  y += 10;

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: ML },
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 2,
      lineColor: [180, 180, 180],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: "bold",
    },
    head: [["Particulars", "Amount (₹)", "Amount (₹)"]],
    body: [
      ["GROSS SALARY", "", ""],
      ["  Basic Salary", fmtMoney(d.annual.basic), ""],
      ["  House Rent Allowance", fmtMoney(d.annual.hra), ""],
      ["  Transport Allowance", fmtMoney(d.annual.transport), ""],
      ["  Medical Allowance", fmtMoney(d.annual.medical), ""],
      ["  Performance Bonus", fmtMoney(d.annual.bonus), ""],
      ["  Gross Salary", "", fmtMoney(d.grossSalary)],
      ["LESS: EXEMPTIONS", "", ""],
      ["  HRA Exempt u/s 10(13A)", fmtMoney(d.hraExempt), ""],
      ["  Standard Deduction u/s 16", fmtMoney(d.standardDeduction), ""],
      ["  Income from Salary", "", fmtMoney(d.incomeSalary)],
      ["LESS: CHAPTER VI-A DEDUCTIONS", "", ""],
      ["  Sec. 80C — Provident Fund", fmtMoney(d.deduction80C), ""],
      ["  Sec. 80D — Medical Insurance", fmtMoney(d.deduction80D), ""],
      ["  Total Deductions", "", fmtMoney(d.totalChapterVIA)],
      ["TOTAL TAXABLE INCOME", "", fmtMoney(d.taxableIncome)],
      ["TAX COMPUTATION (OLD REGIME)", "", ""],
      ["  Income Tax", fmtMoney(d.tax), ""],
      ["  Education Cess @ 4%", fmtMoney(d.cess), ""],
      ["  Total Tax Liability", "", fmtMoney(d.totalTax)],
      ["  Less: TDS Deducted", "", `(${fmtMoney(d.annualTDS)})`],
      [
        d.netTax <= 0 ? "REFUND DUE" : "BALANCE TAX PAYABLE",
        "",
        fmtMoney(Math.abs(d.netTax)),
      ],
    ],
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right", fontStyle: "bold" },
    },
    didParseCell(data) {
      const bold = [0, 7, 11, 16, 21];
      if (bold.includes(data.row.index)) data.cell.styles.fontStyle = "bold";
      if (data.row.index === 22) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [239, 246, 255];
      }
    },
  });

  y = doc.lastAutoTable.finalY + 8;

  /* ── signature ── */
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    "I hereby certify that a sum of ₹" +
      fmtMoney(d.annualTDS) +
      " has been deducted at source and deposited to the credit of the Central Government.",
    ML,
    y,
    { maxWidth: CW },
  );
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.text("For NIDHI IMPEX", PW - ML, y, { align: "right" });
  y += 12;
  doc.line(PW - ML - 40, y, PW - ML, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("Authorised Signatory", PW - ML, y, { align: "right" });

  doc.save(`Form16-${emp.empCode}-${fy}.pdf`);
}

void legacyComputeForm16Data;
void legacyDownloadForm16PDF;

export function computeForm16Data(emp, fy = "2024-25") {
  return buildForm16DocumentData(emp, fy);
}

export function downloadForm16PDF({ emp, fy = "2024-25", data: d }) {
  if (!d) d = buildForm16DocumentData(emp, fy);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = 210;
  const PH = 297;
  const ML = 10;
  const CW = PW - ML * 2;

  // [code, label, amount, type] — "sub"=Rs. in left col, "total"=Rs.X in right col, "header"=no amount
  const page2ComputationRows = [
    [
      "1.(a)",
      "Salary as per provisions contained in section 17(1)",
      d.partB.salary17_1,
      "sub",
    ],
    [
      "1.(b)",
      "Value of perquisites under section 17(2) (as per Form No. 12BA, wherever applicable)",
      d.partB.perquisites,
      "sub",
    ],
    [
      "1.(c)",
      "Profits in lieu of salary under section 17(3) (as per Form No. 12BA, wherever applicable)",
      d.partB.profitsInLieu,
      "sub",
    ],
    ["1.(d)", "Total", d.partB.grossSalary, "total"],
    [
      "1.(e)",
      "Reported total amount of salary received from other employer(s)",
      d.partB.salaryFromOtherEmployers,
      "total",
    ],
    [
      "2.(a)",
      "Travel concession or assistance under section 10(5)",
      d.partB.section10.travelConcession,
      "sub",
    ],
    [
      "2.(b)",
      "Death-cum-retirement gratuity under section 10(10)",
      d.partB.section10.gratuity,
      "sub",
    ],
    [
      "2.(c)",
      "Commuted value of pension under section 10(10A)",
      d.partB.section10.commutedPension,
      "sub",
    ],
    [
      "2.(d)",
      "Cash equivalent of leave salary encashment under section 10(10AA)",
      d.partB.section10.leaveEncashment,
      "sub",
    ],
    [
      "2.(e)",
      "House rent allowance under section 10(13A)",
      d.partB.section10.hra,
      "sub",
    ],
    [
      "2.(f)",
      "Other special allowances under section 10(14)",
      d.partB.section10.specialAllowance,
      "sub",
    ],
    [
      "2.(g)",
      "Amount of any other exemption under section 10",
      d.partB.section10.otherExemption,
      "sub",
    ],
    [
      "2.(h)",
      "Total amount of any other exemption under section 10",
      d.partB.section10.otherExemption,
      "sub",
    ],
    [
      "2.(i)",
      "Total amount of exemption claimed under section 10 [2(a)+2(b)+2(c)+2(d)+2(e)+2(f)+2(h)]",
      d.partB.totalSection10,
      "total",
    ],
    [
      "3.",
      "Total amount of salary received from current employer [1(d)-2(i)]",
      d.partB.grossSalary - d.partB.totalSection10,
      "total",
    ],
    [
      "4.(a)",
      "Standard deduction under section 16(ia)",
      d.partB.deductions16.standardDeduction,
      "sub",
    ],
    [
      "4.(b)",
      "Entertainment allowance under section 16(ii)",
      d.partB.deductions16.entertainmentAllowance,
      "sub",
    ],
    [
      "4.(c)",
      "Tax on employment under section 16(iii)",
      d.partB.deductions16.taxOnEmployment,
      "sub",
    ],
    [
      "5.",
      "Total amount of deductions under section 16 [4(a)+4(b)+4(c)]",
      d.partB.totalDeductions16,
      "total",
    ],
    [
      "6.",
      'Income chargeable under the head "Salaries" [3+1(e)-5]',
      d.partB.incomeFromSalary,
      "total",
    ],
    [
      "7.",
      "Add: Any other income reported by the employee under as per section 192 (2B)",
      null,
      "header",
    ],
    [
      "7.(a)",
      "Income (or admissible loss) from house property reported by employee offered for TDS",
      d.partB.otherIncome.houseProperty,
      "sub",
    ],
    [
      "7.(b)",
      "Income under the head Other Sources offered for TDS",
      d.partB.otherIncome.otherSources,
      "sub",
    ],
    [
      "8.",
      "Total amount of other income reported by the employee [7(a)+7(b)]",
      d.partB.otherIncome.houseProperty + d.partB.otherIncome.otherSources,
      "total",
    ],
    ["9.", "Gross total income (6+8)", d.partB.grossTotalIncome, "total"],
  ];

  const page2ChapterRows = [
    [
      "10.(a)",
      "Deduction in respect of life insurance premia, contributions to provident fund etc. under section 80C",
      d.partB.chapterVIA.section80C.gross,
      d.partB.chapterVIA.section80C.deductible,
    ],
    [
      "10.(b)",
      "Deduction in respect of contribution to certain pension funds under section 80CCC",
      d.partB.chapterVIA.section80CCC.gross,
      d.partB.chapterVIA.section80CCC.deductible,
    ],
    [
      "10.(c)",
      "Deduction in respect of contribution by taxpayer to pension scheme under section 80CCD (1)",
      d.partB.chapterVIA.section80CCD1.gross,
      d.partB.chapterVIA.section80CCD1.deductible,
    ],
    [
      "10.(d)",
      "Total deduction under section 80C, 80CCC and 80CCD(1)",
      d.partB.chapterVIA.section80C.deductible +
        d.partB.chapterVIA.section80CCC.deductible +
        d.partB.chapterVIA.section80CCD1.deductible,
      d.partB.chapterVIA.section80C.deductible +
        d.partB.chapterVIA.section80CCC.deductible +
        d.partB.chapterVIA.section80CCD1.deductible,
    ],
  ];

  // [code, label, gross, qualifying|null, deductible]
  const page3ChapterRows = [
    [
      "10.(e)",
      "Deductions in respect of amount paid/deposited to notified pension scheme under section 80CCD (1B)",
      d.partB.chapterVIA.section80CCD1B.gross,
      null,
      d.partB.chapterVIA.section80CCD1B.deductible,
    ],
    [
      "10.(f)",
      "Deduction in respect of contribution by Employer to pension scheme under section 80CCD (2)",
      d.partB.chapterVIA.section80CCD2.gross,
      null,
      d.partB.chapterVIA.section80CCD2.deductible,
    ],
    [
      "10.(g)",
      "Deduction in respect of health insurance premia under section 80D",
      d.partB.chapterVIA.section80D.gross,
      null,
      d.partB.chapterVIA.section80D.deductible,
    ],
    [
      "10.(h)",
      "Deduction in respect of interest on loan taken for higher education under section 80E",
      d.partB.chapterVIA.section80E.gross,
      null,
      d.partB.chapterVIA.section80E.deductible,
    ],
    [
      "10.(i)",
      "Deduction in respect of contribution by the employee to Agnipath Scheme under section 80CCH",
      d.partB.chapterVIA.section80CCHEmp.gross,
      null,
      d.partB.chapterVIA.section80CCHEmp.deductible,
    ],
    [
      "10.(j)",
      "Deduction in respect of contribution by the Central Government to Agnipath Scheme under section 80CCH",
      d.partB.chapterVIA.section80CCHGovt.gross,
      null,
      d.partB.chapterVIA.section80CCHGovt.deductible,
    ],
    [
      "10.(k)",
      "Total Deduction in respect of donations to certain funds, charitable institutions, etc. under section 80G",
      d.partB.chapterVIA.section80G.gross,
      d.partB.chapterVIA.section80G.qualifying,
      d.partB.chapterVIA.section80G.deductible,
    ],
    [
      "10.(l)",
      "Deduction in respect of interest on deposits in savings account under section 80TTA",
      d.partB.chapterVIA.section80TTA.gross,
      d.partB.chapterVIA.section80TTA.qualifying,
      d.partB.chapterVIA.section80TTA.deductible,
    ],
    [
      "10.(m)",
      "Amount deductible under any other provision(s) of Chapter VI-A",
      d.partB.chapterVIA.otherVIA.gross,
      d.partB.chapterVIA.otherVIA.qualifying,
      d.partB.chapterVIA.otherVIA.deductible,
    ],
    [
      "10.(n)",
      "Total of amount deductible under any other provision(s) of Chapter VI-A",
      d.partB.chapterVIA.otherVIA.gross,
      d.partB.chapterVIA.otherVIA.qualifying,
      d.partB.chapterVIA.otherVIA.deductible,
    ],
  ];

  const page3TaxRows = [
    [
      "11.",
      "Aggregate of deductible amount under Chapter VI-A",
      d.partB.aggregateChapterVIA,
    ],
    ["12.", "Total taxable income (9-11)", d.partB.taxableIncome],
    ["13.", "Tax on total income", d.partB.baseTax],
    ["14.", "Rebate under section 87A, if applicable", d.partB.rebate87A],
    ["15.", "Surcharge, wherever applicable", d.partB.surcharge],
    ["16.", "Health and education cess @ 4%", d.partB.cess],
    ["17.", "Tax payable (13+15+16-14)", d.partB.totalTax],
    ["18.", "Less: Relief under section 89 (attach details)", d.partB.relief89],
    [
      "19.",
      "Less : Tax deducted/ collected at source as per Form No. 12BAA submitted under provisions of section 192(2B)",
      d.partB.taxCollected12BAA,
    ],
    ["20.", "Net tax payable (17-18-19)", d.partB.netTaxPayable],
  ];

  const summaryRows = [
    ["1", "Tax Payable as per Part-B (SN 19)", d.partB.netTaxPayable],
    ["2", "Tax Deducted at Current Employment", d.partB.currentEmploymentTDS],
    ["3", "Tax Deducted at Previous Employment", d.partB.previousEmploymentTDS],
    ["4", "Total Tax Deducted (2+3)", d.partB.totalTaxDeducted],
    [
      "5",
      `Net Tax Payable / Refundable (1-4) (${d.partB.balancePayableOrRefundable > 0 ? "Payable" : "Refundable"})`,
      Math.abs(d.partB.balancePayableOrRefundable),
    ],
  ];

  const setDocFont = (style = "normal", size = 8) => {
    doc.setFont("times", style);
    doc.setFontSize(size);
    doc.setTextColor(0, 0, 0);
  };

  const drawFooter = (text) => {
    setDocFont("bold", 8);
    doc.text(text, PW - ML, PH - 6, { align: "right" });
  };

  const drawVerification = (y, includeTaxLine = false) => {
    setDocFont("bold", 10);
    doc.text("Verification", PW / 2, y, { align: "center" });
    y += 5;

    setDocFont("normal", 8);
    const verificationLines = includeTaxLine
      ? [
          `I, ${FORM16_COMPANY_DETAILS.signatoryName}, son/daughter of working in the capacity of (designation) do hereby certify that a sum of Rs. ${formatForm16Amount(d.partA.totalTaxDeducted)} [Rs. ${formatForm16Amount(d.partA.totalTaxDeducted)} (in words)] has been deducted and deposited to the credit of the Central Government.`,
          "I further certify that the information given above is true, complete and correct and is based on the book of accounts, documents, TDS statements, TDS deposited and other available records.",
        ]
      : [
          `I, ${FORM16_COMPANY_DETAILS.signatoryName}, son/daughter of working in the capacity of (designation) do hereby certify that the information given above is true, complete and correct and is based on the book of accounts, documents, TDS statements, and other available records.`,
        ];

    verificationLines.forEach((line) => {
      const wrapped = doc.splitTextToSize(line, CW);
      doc.text(wrapped, ML, y);
      y += wrapped.length * 4.1;
    });

    y += 2;
    doc.text(`Place : ${FORM16_COMPANY_DETAILS.place}`, ML, y);
    doc.text(`Date : ${d.issueDate}`, ML, y + 8);
    doc.text(
      "(Signature of person responsible for deduction of tax)",
      PW - ML,
      y + 8,
      {
        align: "right",
      },
    );
    doc.text("Designation:", ML, y + 16);
    doc.text(
      `Full Name: ${FORM16_COMPANY_DETAILS.signatoryName}`,
      PW - ML,
      y + 16,
      {
        align: "right",
      },
    );
  };

  const amountCell = (value) => formatForm16Amount(value);

  setDocFont("bold", 14);
  doc.text("FORM NO. 16", PW / 2, 14, { align: "center" });
  setDocFont("italic", 9);
  doc.text("[See rule 31(1)(a)]", PW / 2, 20, { align: "center" });
  setDocFont("bold", 12);
  doc.text("PART A", PW / 2, 28, { align: "center" });
  setDocFont("bold", 8.5);
  doc.text(
    "Certificate under section 203 of the Income-tax Act, 1961 for Tax deducted at source on Salary",
    PW / 2,
    35,
    { align: "center", maxWidth: CW },
  );

  autoTable(doc, {
    startY: 41,
    margin: { left: ML, right: ML },
    theme: "grid",
    styles: {
      font: "times",
      fontSize: 8,
      cellPadding: 1.7,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    columnStyles: { 0: { fontStyle: "bold" }, 2: { fontStyle: "bold" } },
    body: [
      [
        "Certificate No.",
        d.partA.certificateNo,
        "Last updated on",
        d.partA.lastUpdated,
      ],
    ],
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY,
    margin: { left: ML, right: ML },
    theme: "grid",
    styles: {
      font: "times",
      fontSize: 7.6,
      cellPadding: 1.7,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    headStyles: {
      fontStyle: "bold",
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
    },
    head: [
      ["Name and address of the Employer", "Name and address of the Employee"],
    ],
    body: [
      [
        [
          FORM16_COMPANY_DETAILS.name,
          ...FORM16_COMPANY_DETAILS.addressLines,
        ].join("\n"),
        d.employee.nameUpper,
      ],
    ],
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY,
    margin: { left: ML, right: ML },
    theme: "grid",
    styles: {
      font: "times",
      fontSize: 7.4,
      cellPadding: 1.6,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    columnStyles: { 0: { fontStyle: "bold" }, 2: { fontStyle: "bold" } },
    body: [
      [
        "PAN of the Deductor",
        FORM16_COMPANY_DETAILS.deductorPan,
        "TAN of the Deductor",
        FORM16_COMPANY_DETAILS.deductorTan,
      ],
      [
        "PAN of the Employee",
        d.employee.pan,
        "Employee Reference No. provided by the Employer (If available)",
        d.employee.referenceNo,
      ],
      ["CIT (TDS)", "", "Assessment Year", "Period with the Employer"],
      [
        d.partA.commissioner,
        "-",
        d.assessmentYear,
        `From ${d.employmentPeriod.from} To ${d.employmentPeriod.to}`,
      ],
    ],
  });

  setDocFont("bold", 8);
  doc.text(
    "Summary of amount paid/credited and tax deducted at source thereon in respect of the employee",
    PW / 2,
    doc.lastAutoTable.finalY + 5,
    { align: "center" },
  );

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 7,
    margin: { left: ML, right: ML },
    theme: "grid",
    styles: {
      font: "times",
      fontSize: 7.1,
      cellPadding: 1.4,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    headStyles: {
      fontStyle: "bold",
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
    },
    head: [
      [
        "Quarter(s)",
        "Receipt Numbers of original statements of TDS under sub-section (3) of section 200",
        "Amount paid/credited",
        "Amount of tax deducted (Rs.)",
        "Amount of tax deposited/remitted (Rs.)",
      ],
    ],
    body: [
      ...d.partA.quarterRows.map((row) => [
        row.quarter,
        row.receiptNumber,
        amountCell(row.amountPaid),
        amountCell(row.tdsDeducted),
        amountCell(row.tdsDeposited),
      ]),
      [
        { content: "Total (Rs.)", colSpan: 2, styles: { fontStyle: "bold" } },
        amountCell(d.partA.totalAmountPaid),
        amountCell(d.partA.totalTaxDeducted),
        amountCell(d.partA.totalTaxDeposited),
      ],
    ],
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
  });

  setDocFont("bold", 7.8);
  doc.text(
    "I. DETAILS OF TAX DEDUCTED AND DEPOSITED IN THE CENTRAL GOVERNMENT ACCOUNT THROUGH BOOK ADJUSTMENT",
    ML,
    doc.lastAutoTable.finalY + 5,
  );
  setDocFont("italic", 6.7);
  doc.text(
    "(The Deductor to provide payment wise details of tax deducted and deposited with respect to the deductee)",
    ML,
    doc.lastAutoTable.finalY + 9,
  );

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 11,
    margin: { left: ML, right: ML },
    theme: "grid",
    styles: {
      font: "times",
      fontSize: 6.6,
      cellPadding: 1.2,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    headStyles: {
      fontStyle: "bold",
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
    },
    head: [
      [
        {
          content: "S. No.",
          rowSpan: 2,
          styles: { fontStyle: "bold", valign: "middle" },
        },
        {
          content: "Tax Deposited in respect of the Deductee (Rs.)",
          rowSpan: 2,
          styles: { fontStyle: "bold", valign: "middle" },
        },
        {
          content: "Book identification number (BIN)",
          colSpan: 4,
          styles: { fontStyle: "bold", halign: "center" },
        },
      ],
      [
        {
          content: "Receipt numbers of Form No. 24G",
          styles: { fontStyle: "bold" },
        },
        {
          content: "DDO Sequence Number in the Book Adjustment Mini Statement",
          styles: { fontStyle: "bold" },
        },
        {
          content: "Date on which tax deposited (dd/mm/yyyy)",
          styles: { fontStyle: "bold" },
        },
        {
          content: "Status of matching with Form No. 24G",
          styles: { fontStyle: "bold" },
        },
      ],
    ],
    body: [
      [{ content: "Total (Rs.)", colSpan: 6, styles: { fontStyle: "bold" } }],
    ],
  });

  setDocFont("bold", 7.8);
  doc.text(
    "II. DETAILS OF TAX DEDUCTED AND DEPOSITED IN THE CENTRAL GOVERNMENT ACCOUNT THROUGH CHALLAN",
    ML,
    doc.lastAutoTable.finalY + 5,
  );
  setDocFont("italic", 6.7);
  doc.text(
    "(The Deductor to provide payment wise details of tax deducted and deposited with respect to the deductee)",
    ML,
    doc.lastAutoTable.finalY + 9,
  );

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 11,
    margin: { left: ML, right: ML },
    theme: "grid",
    styles: {
      font: "times",
      fontSize: 6.8,
      cellPadding: 1.2,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    headStyles: {
      fontStyle: "bold",
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
    },
    head: [
      [
        {
          content: "S. No.",
          rowSpan: 2,
          styles: { fontStyle: "bold", valign: "middle" },
        },
        {
          content: "Tax Deposited in respect of the Deductee (Rs.)",
          rowSpan: 2,
          styles: { fontStyle: "bold", valign: "middle" },
        },
        {
          content: "Book identification number (BIN)",
          colSpan: 4,
          styles: { fontStyle: "bold", halign: "center" },
        },
      ],
      [
        {
          content: "BSR Code of the Bank Branch",
          styles: { fontStyle: "bold" },
        },
        {
          content: "Date on which tax deposited (dd/mm/yyyy)",
          styles: { fontStyle: "bold" },
        },
        { content: "Challan Serial Number", styles: { fontStyle: "bold" } },
        {
          content: "Status of matching with OLTAS",
          styles: { fontStyle: "bold" },
        },
      ],
    ],
    body: [
      [{ content: "Total (Rs.)", colSpan: 6, styles: { fontStyle: "bold" } }],
    ],
  });

  drawVerification(doc.lastAutoTable.finalY + 8, true);
  drawFooter("Page 1 of 1");

  doc.addPage();

  autoTable(doc, {
    startY: 10,
    margin: { left: ML, right: ML },
    theme: "grid",
    styles: {
      font: "times",
      fontSize: 7.5,
      cellPadding: 1.4,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    body: [
      [
        "TAN of Employer",
        "Name of Employee",
        "PAN of Employee",
        "Assessment Year",
      ],
      [
        FORM16_COMPANY_DETAILS.deductorTan,
        d.employee.nameUpper,
        d.employee.pan,
        d.assessmentYear,
      ],
    ],
    didParseCell(cellData) {
      if (cellData.row.index === 0) cellData.cell.styles.fontStyle = "bold";
    },
  });

  setDocFont("bold", 12);
  doc.text("PART B (Annexure-I)", PW / 2, doc.lastAutoTable.finalY + 8, {
    align: "center",
  });
  setDocFont("bold", 8);
  doc.text(
    "Details of Salary paid and any other income and tax deducted",
    PW / 2,
    doc.lastAutoTable.finalY + 13,
    { align: "center" },
  );

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 17,
    margin: { left: ML, right: ML },
    theme: "grid",
    styles: {
      font: "times",
      fontSize: 7.2,
      cellPadding: 1.4,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    body: [
      [
        "A",
        "Whether opting out of taxation u/s 115BAC(1A)?",
        d.partB.optingOut115BAC,
      ],
    ],
    columnStyles: {
      0: { cellWidth: 10, fontStyle: "bold" },
      1: { cellWidth: 140, fontStyle: "bold" },
      2: { cellWidth: 40, halign: "right", fontStyle: "bold" },
    },
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 3,
    margin: { left: ML, right: ML },
    theme: "grid",
    styles: {
      font: "times",
      fontSize: 6.8,
      cellPadding: 1.2,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    headStyles: {
      fontStyle: "bold",
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
    },
    head: [["Ref", "Particulars", "Rs.", "Amount"]],
    body: page2ComputationRows.map(([code, label, amount, type]) => {
      if (type === "header") return [code, { content: label, colSpan: 3 }];
      if (type === "sub") return [code, label, "Rs.", amountCell(amount)];
      return [code, label, "", `Rs. ${amountCell(amount)}`];
    }),
    columnStyles: {
      0: { cellWidth: 14 },
      1: { cellWidth: 127 },
      2: { cellWidth: 12, halign: "right" },
      3: { cellWidth: 37, halign: "right" },
    },
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 3,
    margin: { left: ML, right: ML },
    theme: "grid",
    styles: {
      font: "times",
      fontSize: 6.7,
      cellPadding: 1.2,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    headStyles: {
      fontStyle: "bold",
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
    },
    head: [
      [
        "Ref",
        "Deductions under Chapter VI-A",
        "Gross Amount",
        "Deductible Amount",
      ],
    ],
    body: page2ChapterRows.map(([code, label, gross, deductible]) => [
      code,
      label,
      `Rs. ${amountCell(gross)}`,
      `Rs. ${amountCell(deductible)}`,
    ]),
    columnStyles: {
      0: { cellWidth: 14 },
      1: { cellWidth: 110 },
      2: { cellWidth: 33, halign: "right" },
      3: { cellWidth: 33, halign: "right" },
    },
  });

  drawFooter("Page 1 of 3");

  doc.addPage();

  autoTable(doc, {
    startY: 10,
    margin: { left: ML, right: ML },
    theme: "grid",
    styles: {
      font: "times",
      fontSize: 6.7,
      cellPadding: 1.2,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    headStyles: {
      fontStyle: "bold",
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
    },
    head: [
      [
        "Ref",
        "Deductions under Chapter VI-A",
        "Gross Amount",
        "Qualifying Amount",
        "Deductible Amount",
      ],
    ],
    body: page3ChapterRows.map(
      ([code, label, gross, qualifying, deductible]) => [
        code,
        label,
        `Rs. ${amountCell(gross)}`,
        `Rs. ${amountCell(qualifying ?? 0)}`,
        `Rs. ${amountCell(deductible)}`,
      ],
    ),
    columnStyles: {
      0: { cellWidth: 14 },
      1: { cellWidth: 88 },
      2: { cellWidth: 26, halign: "right" },
      3: { cellWidth: 26, halign: "right" },
      4: { cellWidth: 36, halign: "right" },
    },
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 3,
    margin: { left: ML, right: ML },
    theme: "grid",
    styles: {
      font: "times",
      fontSize: 6.8,
      cellPadding: 1.2,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    headStyles: {
      fontStyle: "bold",
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
    },
    head: [["Ref", "Tax Computation", "Rs.", "Amount"]],
    body: page3TaxRows.map(([code, label, amount]) => [
      code,
      label,
      "",
      `Rs. ${amountCell(amount)}`,
    ]),
    columnStyles: {
      0: { cellWidth: 14 },
      1: { cellWidth: 127 },
      2: { cellWidth: 12, halign: "right" },
      3: { cellWidth: 37, halign: "right" },
    },
  });

  drawVerification(doc.lastAutoTable.finalY + 8, false);
  drawFooter("Page 2 of 3");

  doc.addPage();

  autoTable(doc, {
    startY: 10,
    margin: { left: ML, right: ML },
    theme: "grid",
    styles: {
      font: "times",
      fontSize: 7.4,
      cellPadding: 1.4,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    columnStyles: { 0: { fontStyle: "bold" }, 2: { fontStyle: "bold" } },
    body: [
      [
        "Name of the Employer",
        FORM16_COMPANY_DETAILS.name,
        "Name of the Employee",
        d.employee.nameUpper,
      ],
      [
        "PAN of the Deductor",
        FORM16_COMPANY_DETAILS.deductorPan,
        "TAN of the Deductor",
        FORM16_COMPANY_DETAILS.deductorTan,
      ],
      [
        "PAN of the Employee",
        d.employee.pan,
        "Assessment Year",
        d.assessmentYear,
      ],
      ["Financial Year", d.financialYear, "Designation", emp.role || "-"],
    ],
  });

  setDocFont("bold", 12);
  doc.text("Tax Deducted Summary", PW / 2, doc.lastAutoTable.finalY + 8, {
    align: "center",
  });
  setDocFont("normal", 8);
  doc.text(
    "(Summary of Tax Payable and Tax Deducted Information)",
    PW / 2,
    doc.lastAutoTable.finalY + 13,
    { align: "center" },
  );

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 17,
    margin: { left: ML, right: ML },
    theme: "grid",
    styles: {
      font: "times",
      fontSize: 7.1,
      cellPadding: 1.4,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    headStyles: {
      fontStyle: "bold",
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
    },
    head: [["Sl. No.", "Particulars", "Amount"]],
    body: summaryRows.map(([serial, label, amount]) => [
      serial,
      label,
      amountCell(amount),
    ]),
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 132 },
      2: { cellWidth: 40, halign: "right" },
    },
  });

  drawVerification(doc.lastAutoTable.finalY + 10, false);
  drawFooter("Page 3 of 3");

  doc.save(`Form16-${emp.empCode}-${fy}.pdf`);
}

// ─── main payslip export ──────────────────────────────────────────────────────

function legacyDownloadPayslipPDF({ emp, payslip }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = 210;
  const ML = 14;
  const CW = PW - ML * 2; // 182 mm

  const {
    idx,
    year,
    short: shortMon,
    num: monNum,
  } = parseMonthYear(payslip.month);
  const lastDay = daysInMonth(idx, year);
  const dateFrom = `01/${monNum}/${year}`;
  const dateTo = `${lastDay}/${monNum}/${year}`;

  // ── company header block (bordered box) ──────────────────────────────────
  const headerBoxY = 8;
  const headerBoxH = 44;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(ML, headerBoxY, CW, headerBoxH);

  // Company name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(0, 0, 0);
  doc.text("NIDHI IMPEX", PW / 2, headerBoxY + 8, { align: "center" });

  // Address lines
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(60, 60, 60);
  doc.text(
    "2ND TO 7TH FLOOR, SY NO. 376 PLOT NO 7 TPS NO,4, SHREEJI BUILDING,",
    PW / 2,
    headerBoxY + 14,
    { align: "center" },
  );
  doc.text(
    "PURSHOTTAM FARM COMPOUND, OPP. PODDAR ARCADE,, VARACHHA ROAD, SURAT-395006 GUJARAT",
    PW / 2,
    headerBoxY + 18,
    { align: "center" },
  );

  // Inner divider between address and title
  doc.setDrawColor(160, 160, 160);
  doc.setLineWidth(0.25);
  doc.line(ML + 2, headerBoxY + 22, PW - ML - 2, headerBoxY + 22);

  // Pay slip title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(0, 0, 0);
  doc.text(
    `Pay Slip For the Month of ${shortMon}-${year}`,
    PW / 2,
    headerBoxY + 30,
    { align: "center" },
  );

  // Date range
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  doc.text(`(From ${dateFrom} To ${dateTo})`, PW / 2, headerBoxY + 37, {
    align: "center",
  });

  let y = headerBoxY + headerBoxH + 2; // ≈ 54

  // ── employee info table ───────────────────────────────────────────────────
  // col widths: 36 + 55 + 36 + 55 = 182
  const phone = emp.phone || "N.A.";
  autoTable(doc, {
    body: [
      [
        "Employee Name",
        `: ${(emp.name || "").toUpperCase()}`,
        "Employee Code",
        `: ${emp.empCode || ""}`,
      ],
      ["Bank A/c No.", ": N.A.", "Bank Name", ": N.A."],
      ["UAN", ": N.A.", "Mobile", `: ${phone}`],
      ["Designation", `: ${(emp.role || "").toUpperCase()}`, "", ""],
      ["Total Paid Days", ": 26", "LWP", ": 0"],
      ["Net Paid Days", ": 26", "", ""],
    ],
    startY: y,
    margin: { left: ML, right: ML },
    theme: "grid",
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 2.2, right: 3, bottom: 2.2, left: 3 },
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 36, fillColor: [245, 245, 245] },
      1: { cellWidth: 55 },
      2: { fontStyle: "bold", cellWidth: 36, fillColor: [245, 245, 245] },
      3: { cellWidth: 55 },
    },
  });

  y = doc.lastAutoTable.finalY + 1;

  // ── earnings & deductions ─────────────────────────────────────────────────
  const basic = emp.basicSalary || 0;
  const allowance = emp.allowances || 0;
  const bonus = emp.bonus || 0;
  const deductAmt = emp.deductions || 0;

  const hra = Math.round(allowance * 0.45);
  const dailyAlw = Math.round(allowance * 0.35);
  const conv = Math.round(allowance * 0.12);
  const medical = Math.round(allowance * 0.08);
  const profTax = Math.round(deductAmt * 0.2);
  const pf = Math.round(deductAmt * 0.5);
  const tds = deductAmt - profTax - pf;

  const earningsRows = [
    ["BASIC", basic],
    ["HRA", hra],
    ["DAILY ALLOWANCE", dailyAlw],
    ["Conv.A", conv],
    ["Prod. Ince.", bonus],
    ["Medical Allow.", medical],
  ];
  const deductionsRows = [
    ["PROFESSIONAL TAX", profTax],
    ["PF", pf],
    ["TDS", tds],
  ];

  const totalEarn = earningsRows.reduce((s, r) => s + r[1], 0);
  const totalDed = deductionsRows.reduce((s, r) => s + r[1], 0);
  const netPay = payslip.amount ?? totalEarn - totalDed;

  const maxR = Math.max(earningsRows.length, deductionsRows.length);
  const tableBody = Array.from({ length: maxR }, (_, i) => {
    const e = earningsRows[i];
    const d = deductionsRows[i];
    return [
      e?.[0] ?? "",
      e ? fmtMoney(e[1]) : "",
      e ? fmtMoney(e[1]) : "",
      d?.[0] ?? "",
      d ? fmtMoney(d[1]) : "",
      d ? fmtMoney(d[1]) : "",
    ];
  });
  tableBody.push([
    "Total Earnings",
    fmtMoney(totalEarn),
    fmtMoney(totalEarn),
    "Total Deductions",
    fmtMoney(totalDed),
    fmtMoney(totalDed),
  ]);

  // col widths: 42 + 26 + 23 + 42 + 26 + 23 = 182
  autoTable(doc, {
    head: [
      [
        "Earnings",
        { content: "Scale Rs.", styles: { halign: "right" } },
        { content: "Amount Rs.", styles: { halign: "right" } },
        "Deductions",
        { content: "Scale Rs.", styles: { halign: "right" } },
        { content: "Amount Rs.", styles: { halign: "right" } },
      ],
    ],
    body: tableBody,
    startY: y,
    margin: { left: ML, right: ML },
    theme: "grid",
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 2.2, right: 3, bottom: 2.2, left: 3 },
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
    },
    headStyles: {
      fillColor: [40, 40, 40],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
    },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { halign: "right", cellWidth: 26 },
      2: { halign: "right", cellWidth: 23 },
      3: { cellWidth: 42 },
      4: { halign: "right", cellWidth: 26 },
      5: { halign: "right", cellWidth: 23 },
    },
    didParseCell(data) {
      if (data.section === "body" && data.row.index === tableBody.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [235, 235, 235];
      }
    },
  });

  y = doc.lastAutoTable.finalY + 3;

  // ── net pay highlighted box ───────────────────────────────────────────────
  const words = numberToWords(Math.round(netPay));
  const wordsText = `: Rs. ${words} Only`;
  const wordsWrapped = doc.splitTextToSize(wordsText, CW - 28);
  const netBoxH = 6 + 6 + (wordsWrapped.length - 1) * 5 + 6; // top + line1 + extra lines + bottom

  doc.setFillColor(240, 248, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.rect(ML, y, CW, netBoxH);

  const bY = y + 5.5;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Net Pay", ML + 4, bY);
  doc.setFont("helvetica", "normal");
  doc.text(`: Rs. ${fmtMoney(netPay)}`, ML + 28, bY);

  const bY2 = bY + 6;
  doc.setFont("helvetica", "bold");
  doc.text("In Words", ML + 4, bY2);
  doc.setFont("helvetica", "normal");
  doc.text(wordsWrapped, ML + 28, bY2);

  y += netBoxH + 3;

  // ── miscellaneous information ─────────────────────────────────────────────
  autoTable(doc, {
    head: [["Miscellaneous Information", ""]],
    body: [["SALARY", fmtMoney(basic + allowance)]],
    startY: y,
    margin: { left: ML, right: ML },
    theme: "grid",
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 2.2, right: 3, bottom: 2.2, left: 3 },
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
    },
    headStyles: {
      fillColor: [245, 245, 245],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
    },
    columnStyles: {
      0: { cellWidth: CW - 34 },
      1: { halign: "right", cellWidth: 34 },
    },
  });

  y = doc.lastAutoTable.finalY + 5;

  // ── footer ────────────────────────────────────────────────────────────────
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(ML, y, PW - ML, y);
  y += 5;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.text(`TDS Deducted Upto ${shortMon}-${year} : Rs. Nil`, ML, y);
  y += 5;
  doc.text(
    "This is Computer Generated Sheet, does not require Signature.",
    ML,
    y,
  );

  // Authorised signatory block
  const sigY = y + 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text("NIDHI IMPEX", PW - ML, sigY - 5, { align: "right" });
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(PW - ML - 50, sigY, PW - ML, sigY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(60, 60, 60);
  doc.text("Authorised Signatory", PW - ML, sigY + 4, { align: "right" });

  const safeCode = (emp.empCode || "EMP").replace(/\s+/g, "-");
  const safeMon = (payslip.month || "payslip").replace(/\s+/g, "-");
  doc.save(`payslip-${safeCode}-${safeMon}.pdf`);
}

void legacyDownloadPayslipPDF;

export function downloadPayslipPDF({ emp, payslip }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = 210;
  const ML = 14;
  const CW = PW - ML * 2;
  const data = buildPayslipData({ emp, payslip });

  const drawCompanyMark = (x, y, size) => {
    try {
      // Attempt to add the actual logo image
      doc.addImage(COMPANY_DETAILS.logo, "PNG", x, y, size, size);
    } catch {
      // Fallback to the professional placeholder if image is missing/incompatible
      doc.setFillColor(37, 99, 235); // Blue 600
      doc.roundedRect(x, y + 2, size, size, 3, 3, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("NI", x + size / 2, y + size / 2 + 4, { align: "center" });
    }
    doc.setTextColor(0, 0, 0);
  };

  let y = 16;
  const headerLogoSize = 24;
  const headerLogoX = ML + 5;
  const headerLogoY = y + 5;
  const headerTextLeft = ML + 38;
  const headerTextRight = PW - ML;
  const headerTextWidth = headerTextRight - headerTextLeft;
  const headerTextX = headerTextLeft + headerTextWidth / 2;

  drawCompanyMark(headerLogoX, headerLogoY, headerLogoSize);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12.5);
  doc.text(COMPANY_DETAILS.name, headerTextX, y + 4, { align: "center" });
  doc.setFontSize(7.3);
  doc.text(COMPANY_DETAILS.addressLines[0], headerTextX, y + 10, {
    align: "center",
    maxWidth: headerTextWidth,
  });
  doc.text(COMPANY_DETAILS.addressLines[1], headerTextX, y + 15, {
    align: "center",
    maxWidth: headerTextWidth,
  });
  doc.setFontSize(11);
  doc.text(
    `Pay Slip For the Month of ${data.monthLabel}`,
    headerTextX,
    y + 23,
    {
      align: "center",
    },
  );
  doc.text(`(From ${data.dateFrom} To ${data.dateTo})`, headerTextX, y + 29, {
    align: "center",
  });

  y += 36;

  autoTable(doc, {
    body: [
      [
        "Employee Name",
        `: ${data.employee.nameUpper}`,
        "Employee Code",
        `: ${data.employee.empCode}`,
      ],
      [
        "Bank A/c No.",
        `: ${data.employee.bankAccount}`,
        "Bank Name",
        `: ${data.employee.bankName}`,
      ],
      ["UAN", `: ${data.employee.uan}`, "Mobile", `: ${data.employee.mobile}`],
      [
        "Designation",
        `: ${String(data.employee.designation || "").toUpperCase()}`,
        "Unit",
        `: ${String(data.employee.unit || "").toUpperCase()}`,
      ],
      [
        "PF Account No",
        `: ${data.employee.pfAccountNo || "-"}`,
        "ESI ID No",
        `: ${data.employee.esiAccountNo || "-"}`,
      ],
    ],
    startY: y,
    margin: { left: ML, right: ML },
    theme: "grid",
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 1.6, right: 2, bottom: 1.6, left: 2 },
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
      overflow: "linebreak",
    },
    columnStyles: {
      0: { cellWidth: 31 },
      1: { cellWidth: 58, fontStyle: "bold" },
      2: { cellWidth: 31 },
      3: { cellWidth: 58, fontStyle: "bold" },
    },
  });

  y = doc.lastAutoTable.finalY;

  autoTable(doc, {
    body: [
      [
        "Total Paid Days",
        `: ${data.employee.totalPaidDays}`,
        "LWP",
        `: ${data.employee.lwp}`,
      ],
      ["Net Paid Days", `: ${data.employee.netPaidDays}`, "", ""],
    ],
    startY: y,
    margin: { left: ML, right: ML },
    theme: "grid",
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 1.6, right: 2, bottom: 1.6, left: 2 },
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
    },
    columnStyles: {
      0: { cellWidth: 31, fontStyle: "bold" },
      1: { cellWidth: 58, fontStyle: "bold" },
      2: { cellWidth: 31, fontStyle: "bold" },
      3: { cellWidth: 58, fontStyle: "bold" },
    },
  });

  y = doc.lastAutoTable.finalY + 4;

  const tableBody = Array.from({ length: data.rowCount }, (_, index) => {
    const earning = data.earningRows[index];
    const deduction = data.deductionRows[index];

    return [
      earning?.label || "",
      earning ? fmtMoney(earning.amount) : "",
      earning ? fmtMoney(earning.amount) : "",
      deduction?.label || "",
      deduction ? fmtMoney(deduction.amount) : "",
      deduction ? fmtMoney(deduction.amount) : "",
    ];
  });

  tableBody.push([
    "Total Earnings",
    fmtMoney(data.totals.earnings),
    fmtMoney(data.totals.earnings),
    "Total Deductions",
    fmtMoney(data.totals.deductions),
    fmtMoney(data.totals.deductions),
  ]);

  autoTable(doc, {
    head: [
      [
        "Earnings",
        { content: "Scale Rs.", styles: { halign: "right" } },
        { content: "Amount Rs.", styles: { halign: "right" } },
        "Deductions",
        { content: "Scale Rs.", styles: { halign: "right" } },
        { content: "Amount Rs.", styles: { halign: "right" } },
      ],
    ],
    body: tableBody,
    startY: y,
    margin: { left: ML, right: ML },
    theme: "grid",
    styles: {
      fontSize: 8.2,
      cellPadding: { top: 1.4, right: 2, bottom: 1.4, left: 2 },
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
    },
    columnStyles: {
      0: { cellWidth: 41 },
      1: { cellWidth: 24, halign: "right" },
      2: { cellWidth: 24, halign: "right" },
      3: { cellWidth: 41 },
      4: { cellWidth: 24, halign: "right" },
      5: { cellWidth: 24, halign: "right" },
    },
    didParseCell(hookData) {
      if (
        hookData.section === "body" &&
        hookData.row.index === tableBody.length - 1
      ) {
        hookData.cell.styles.fontStyle = "bold";
      }
    },
  });

  y = doc.lastAutoTable.finalY;

  const labelWidth = 24;
  const netPayRowHeight = 7;
  const words = doc.splitTextToSize(
    `: Rs. ${data.netPayInWords}`,
    CW - labelWidth - 6,
  );
  const wordsRowHeight = Math.max(8, words.length * 4.5 + 3);
  const netHeight = netPayRowHeight + wordsRowHeight;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.setFillColor(248, 248, 248);
  doc.rect(ML, y, CW, netPayRowHeight, "F");
  doc.rect(ML, y, CW, netHeight);
  doc.line(ML, y + netPayRowHeight, ML + CW, y + netPayRowHeight);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Net Pay", ML + 2, y + 4.7);
  doc.setFont("helvetica", "normal");
  doc.text(`: Rs. ${fmtMoney(data.totals.netPay)}`, ML + labelWidth, y + 4.7);
  doc.setFont("helvetica", "bold");
  doc.text("In Words", ML + 2, y + netPayRowHeight + 5);
  doc.setFont("helvetica", "normal");
  doc.text(words, ML + labelWidth, y + netPayRowHeight + 5);

  y += netHeight + 5;

  const miscHeight = 54;
  const miscHeaderHeight = 8;
  const salaryRowHeight = 7;
  const miscRightWidth = 34;
  const miscRightX = PW - ML - miscRightWidth;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.setFillColor(248, 248, 248);
  doc.rect(ML, y, CW, miscHeaderHeight, "F");
  doc.rect(ML, y, CW, miscHeight);
  doc.line(ML, y + miscHeaderHeight, ML + CW, y + miscHeaderHeight);
  doc.line(
    ML,
    y + miscHeaderHeight + salaryRowHeight,
    ML + CW,
    y + miscHeaderHeight + salaryRowHeight,
  );
  doc.line(
    miscRightX,
    y + miscHeaderHeight,
    miscRightX,
    y + miscHeaderHeight + salaryRowHeight,
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Miscellaneous Information", ML + 2, y + 5.2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.8);
  doc.text("SALARY", ML + 2, y + miscHeaderHeight + 4.8);
  doc.setFont("helvetica", "bold");
  doc.text(
    fmtMoney(data.totals.salaryCredited),
    PW - ML - 2,
    y + miscHeaderHeight + 4.8,
    { align: "right" },
  );

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.8);
  doc.text(
    `TDS Deducted Upto ${data.monthLabel}: Rs. Nil`,
    ML + 2,
    y + miscHeaderHeight + salaryRowHeight + 11,
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(
    "This is Computer Generated Sheet, does not require Signature.",
    ML + 2,
    y + miscHeaderHeight + salaryRowHeight + 17,
  );
  doc.setFontSize(8.6);
  doc.text(COMPANY_DETAILS.name, PW - ML - 18, y + miscHeight - 11, {
    align: "right",
  });

  const safeCode = String(emp?.empCode || payslip?.empCode || "EMP").replace(
    /\s+/g,
    "-",
  );
  const safeMon = String(payslip?.month || "payslip").replace(/\s+/g, "-");
  doc.save(`payslip-${safeCode}-${safeMon}.pdf`);
}
