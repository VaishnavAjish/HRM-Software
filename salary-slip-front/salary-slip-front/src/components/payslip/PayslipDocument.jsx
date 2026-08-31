import {
  buildPayslipData,
  formatCurrency,
  formatDate,
  formatMoneyValue,
  numberToWords,
} from "../../utils/payslipUtils";

function CompanyLogo({ company, large = false }) {
  const isWideLogo = company?.id === "silver-star";
  const sizeClass = large
    ? isWideLogo
      ? "h-14 w-auto max-w-[160px]"
      : "h-14 w-14"
    : isWideLogo
      ? "h-9 w-auto max-w-[120px]"
      : "h-10 w-10";

  if (company.logo) {
    return (
      <img
        src={company.logo}
        alt={`${company.label} logo`}
        className={`block ${sizeClass} object-contain ${isWideLogo ? "object-left" : ""}`}
        loading="eager"
      />
    );
  }

  return (
    <div
      className={`flex ${sizeClass} items-center justify-center rounded-xl border border-neutral-300 bg-neutral-100 text-base font-black text-neutral-700`}
    >
      {company.initials}
    </div>
  );
}

function buildNidhiTableRows(data) {
  const activeEarnings = (data.earningRows || []).filter((r) => r && Number(r.amount || 0) !== 0);
  const activeDeductions = (data.deductionRows || []).filter((r) => r && Number(r.amount || 0) !== 0);

  if (activeEarnings.length === 0 && data.earningRows?.length > 0) {
    activeEarnings.push(data.earningRows[0]);
  }
  if (activeDeductions.length === 0 && data.deductionRows?.length > 0) {
    activeDeductions.push(data.deductionRows[0]);
  }

  const rowCount = Math.max(activeEarnings.length, activeDeductions.length, 4);

  return Array.from({ length: rowCount }, (_, index) => ({
    earning: activeEarnings[index] ?? null,
    deduction: activeDeductions[index] ?? null,
  }));
}

function NidhiPayslipLayout({ data, className }) {
  const rows = buildNidhiTableRows(data);

  return (
    <article
      data-payslip-document="true"
      className={`mx-auto w-full max-w-[720px] bg-white text-black shadow-[0_10px_30px_rgba(0,0,0,0.08)] ${className}`}
      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      <div className="border border-black p-3 sm:p-4 pb-5">
        {/* Header */}
        <div className="grid grid-cols-[100px_1fr_100px] items-center gap-2 border-b border-black pb-2.5 mb-2">
          <div className="flex h-14 items-center justify-start overflow-hidden">
            <CompanyLogo company={data.company} large />
          </div>
          <div className="text-center">
            <h1 className="text-sm font-extrabold uppercase leading-tight tracking-wide sm:text-base">
              {data.company.name}
            </h1>
            {data.company.addressLines.map((line) => (
              <p
                key={line}
                className="text-[9px] font-medium leading-tight text-neutral-800"
              >
                {line}
              </p>
            ))}
            <p className="mt-0.5 text-[11px] font-bold leading-tight">
              Pay Slip For the Month of {data.monthLabel}
            </p>
            <p className="text-[9.5px] font-semibold text-neutral-700">
              (From {data.dateFrom} To {data.dateTo})
            </p>
          </div>
          <div />
        </div>

        {/* Employee Info & Attendance (Unified Single Table - Zero Overlap) */}
        <section className="border border-black mb-2">
          <table className="w-full border-collapse text-[11px] leading-snug">
            <tbody>
              <tr className="border-b border-neutral-300">
                <td className="w-[18%] px-2 py-1 align-middle font-normal">Employee Name</td>
                <td className="w-[32%] px-2 py-1 align-middle font-bold">: {data.employee.nameUpper}</td>
                <td className="w-[18%] px-2 py-1 align-middle font-normal">Employee Code</td>
                <td className="w-[32%] px-2 py-1 align-middle font-bold">: {data.employee.empCode}</td>
              </tr>
              <tr className="border-b border-neutral-300">
                <td className="px-2 py-1 align-middle">Bank A/c No.</td>
                <td className="px-2 py-1 align-middle font-bold">: {data.employee.bankAccount}</td>
                <td className="px-2 py-1 align-middle">Bank Name</td>
                <td className="px-2 py-1 align-middle font-bold">: {data.employee.bankName}</td>
              </tr>
              <tr className="border-b border-neutral-300">
                <td className="px-2 py-1 align-middle">UAN</td>
                <td className="px-2 py-1 align-middle font-bold">: {data.employee.uan}</td>
                <td className="px-2 py-1 align-middle">Mobile</td>
                <td className="px-2 py-1 align-middle font-bold">: {data.employee.mobile}</td>
              </tr>
              <tr className="border-b border-neutral-300">
                <td className="px-2 py-1 align-middle">Designation</td>
                <td className="px-2 py-1 align-middle font-bold uppercase">: {data.employee.designation}</td>
                <td className="px-2 py-1 align-middle">Unit</td>
                <td className="px-2 py-1 align-middle font-bold uppercase">: {data.employee.unit}</td>
              </tr>
              <tr className="border-b border-black">
                <td className="px-2 py-1 align-middle">PF Account No</td>
                <td className="px-2 py-1 align-middle font-bold uppercase">: {data.employee.pfAccountNo}</td>
                <td className="px-2 py-1 align-middle">ESI ID No</td>
                <td className="px-2 py-1 align-middle font-bold uppercase">: {data.employee.esiAccountNo}</td>
              </tr>
              <tr className="border-b border-neutral-300 bg-neutral-50 font-bold">
                <td className="px-2 py-1 align-middle">Total Paid Days</td>
                <td className="px-2 py-1 align-middle font-bold">: {data.employee.totalPaidDays}</td>
                <td className="px-2 py-1 align-middle font-bold">LWP</td>
                <td className="px-2 py-1 align-middle font-bold">: {data.employee.lwp}</td>
              </tr>
              <tr className="bg-neutral-50 font-bold">
                <td className="px-2 py-1 align-middle">Net Paid Days</td>
                <td className="px-2 py-1 align-middle font-bold">: {data.employee.netPaidDays}</td>
                <td className="px-2 py-1 align-middle"></td>
                <td className="px-2 py-1 align-middle"></td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Calculation Table */}
        <section className="border border-black mb-2">
          <table className="w-full border-collapse text-[11px] leading-snug">
            <thead>
              <tr className="font-bold border-b border-black bg-neutral-100">
                <th className="border-r border-black px-2 py-1 text-left">Earnings</th>
                <th className="border-r border-black px-2 py-1 text-right">Scale Rs.</th>
                <th className="border-r border-black px-2 py-1 text-right">Amount Rs.</th>
                <th className="border-r border-black px-2 py-1 text-left">Deductions</th>
                <th className="border-r border-black px-2 py-1 text-right">Scale Rs.</th>
                <th className="px-2 py-1 text-right">Amount Rs.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ earning, deduction }, index) => (
                <tr key={index} className="border-b border-neutral-200">
                  <td className="border-r border-black px-2 py-1 font-medium">
                    {earning?.label || ""}
                  </td>
                  <td className="border-r border-black px-2 py-1 text-right">
                    {earning ? formatMoneyValue(earning.amount) : ""}
                  </td>
                  <td className="border-r border-black px-2 py-1 text-right font-medium">
                    {earning ? formatMoneyValue(earning.amount) : ""}
                  </td>
                  <td className="border-r border-black px-2 py-1 font-medium">
                    {deduction?.label || ""}
                  </td>
                  <td className="border-r border-black px-2 py-1 text-right">
                    {deduction ? formatMoneyValue(deduction.amount) : ""}
                  </td>
                  <td className="px-2 py-1 text-right font-medium">
                    {deduction ? formatMoneyValue(deduction.amount) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-black text-[11px] font-bold bg-neutral-50">
                <td className="border-r border-black px-2 py-1">Total Earnings</td>
                <td className="border-r border-black px-2 py-1 text-right">{formatMoneyValue(data.totals.earnings)}</td>
                <td className="border-r border-black px-2 py-1 text-right">{formatMoneyValue(data.totals.earnings)}</td>
                <td className="border-r border-black px-2 py-1">Total Deductions</td>
                <td className="border-r border-black px-2 py-1 text-right">{formatMoneyValue(data.totals.deductions)}</td>
                <td className="px-2 py-1 text-right">{formatMoneyValue(data.totals.deductions)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* Net Pay */}
        <section className="border border-black mb-2 text-[11px] leading-snug">
          <div className="grid grid-cols-[76px_1fr] border-b border-black bg-neutral-50 px-2 py-1 font-extrabold">
            <span>Net Pay</span>
            <span>: {formatCurrency(data.totals.netPay)}</span>
          </div>
          <div className="grid grid-cols-[76px_1fr] px-2 py-1 font-bold">
            <span>In Words</span>
            <span className="font-medium">: Rs. {data.netPayInWords}</span>
          </div>
        </section>

        {/* Miscellaneous Information & Footer */}
        <section className="border border-black text-[11px] leading-snug">
          <div className="border-b border-black bg-neutral-100 px-2 py-1 font-bold">
            Miscellaneous Information
          </div>
          <div className="grid grid-cols-[1fr_150px] border-b border-black">
            <div className="px-2 py-1 font-semibold">SALARY</div>
            <div className="border-l border-black px-2 py-1 text-right font-bold">
              {formatMoneyValue(data.totals.salaryCredited)}
            </div>
          </div>
          <div className="px-2 pt-1.5 pb-2">
            <p className="italic text-neutral-600">
              TDS Deducted Upto {data.monthLabel}: Rs. Nil
            </p>
            <p className="font-bold text-neutral-900 mt-0.5">
              This is Computer Generated Sheet, does not require Signature.
            </p>
            <div className="mt-4 flex items-end justify-between gap-4 pt-1">
              <div className="text-[10px] font-semibold text-neutral-700">
                Paid On: {formatDate(data.payDate)}
              </div>
              <div className="text-right">
                <p className="text-[11px] font-extrabold text-neutral-900 uppercase">
                  {data.company.name}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </article>
  );
}

function buildSilverTableRows(data) {
  const earningDefs = [
    { key: "basicSalary", label: "BASIC" },
    { key: "dailyAllowance", label: "DA" },
    { key: "hra", label: "HRA" },
    { key: "wa", label: "WA" },
    { key: "conveyanceAllowance", label: "CON.AL" },
    { key: "educationAllowance", label: "EDU.A" },
    { key: "medicalAllowance", label: "MED.A" },
    { key: "mobileAllowance", label: "MOB.A" },
    { key: "perfo", label: "PERFO" },
    { key: "other", label: "OTHER" },
    { key: "bonus", label: "PROD. INCE." },
  ];

  const deductionDefs = [
    { key: "professionalTax", label: "PROFESSIONAL TAX" },
    { key: "providentFund", label: "PF" },
    { key: "esiAmount", label: "ESI" },
    { key: "tds", label: "TDS" },
    { key: "lwf", label: "LWF" },
    { key: "advance", label: "ADVANCE" },
  ];

  const nonZeroRows = (defs) =>
    defs
      .map((def) => {
        let amount = Number(data.components[def.key] || 0);
        if (def.key === "perfo" && amount === 0) {
          amount = Number(data.components.comm || 0);
        }
        if (def.key === "other" && amount === 0) {
          amount = Number(data.components.others || 0);
        }
        return {
          label: def.label,
          amount,
        };
      })
      .filter((row) => row.amount !== 0);

  const earnings = nonZeroRows(earningDefs);
  const unallocatedEarning = (data.earningRows || []).find(
    (r) => r?.label === "ALLOWANCES" && Number(r.amount || 0) !== 0,
  );
  if (unallocatedEarning) {
    earnings.push(unallocatedEarning);
  }

  const deductions = nonZeroRows(deductionDefs);
  const unallocatedDeduction = (data.deductionRows || []).find(
    (r) => r?.label === "OTHER DEDUCTION" && Number(r.amount || 0) !== 0,
  );
  if (unallocatedDeduction) {
    deductions.push(unallocatedDeduction);
  }

  if (earnings.length === 0) {
    earnings.push({
      label: "BASIC",
      amount: Number(data.components.basicSalary || 0),
    });
  }
  if (deductions.length === 0) {
    deductions.push({
      label: "PROFESSIONAL TAX",
      amount: Number(data.components.professionalTax || 0),
    });
  }

  const rowCount = Math.max(earnings.length, deductions.length, 4);

  const rows = Array.from({ length: rowCount }, (_, index) => ({
    earning: earnings[index] ?? null,
    deduction: deductions[index] ?? null,
  }));

  return {
    rows,
    totalEarnings: data.totals.earnings,
    totalDeductions: data.totals.deductions,
    netPay: data.totals.netPay,
  };
}

function SilverPayslipLayout({ data, className }) {
  const { rows, totalEarnings, totalDeductions, netPay } =
    buildSilverTableRows(data);

  return (
    <article
      data-payslip-document="true"
      className={`mx-auto w-full max-w-[720px] bg-white text-black shadow-[0_10px_30px_rgba(0,0,0,0.08)] ${className}`}
      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      <div className="border border-black p-3 sm:p-4 pb-5">
        <div className="grid grid-cols-[140px_1fr_140px] items-center gap-2 border-b border-black pb-2.5 mb-2">
          <div className="flex h-14 items-center justify-start overflow-hidden">
            <CompanyLogo company={data.company} large />
          </div>
          <div className="text-center">
            <h1 className="text-xs font-extrabold uppercase leading-tight tracking-wide sm:text-sm">
              {data.company.name}
            </h1>
            {data.company.addressLines.map((line) => (
              <p
                key={line}
                className="text-[9px] font-medium uppercase leading-tight text-neutral-800"
              >
                {line}
              </p>
            ))}
            <p className="mt-0.5 text-[11px] font-bold leading-tight">
              Pay Slip For the Month of {data.monthLabel}
            </p>
            <p className="text-[9.5px] font-semibold text-neutral-700">
              (From {data.dateFrom} To {data.dateTo})
            </p>
          </div>
          <div />
        </div>

        <section className="border border-black mb-2">
          <table className="w-full border-collapse text-[11px] leading-snug">
            <tbody>
              <tr className="border-b border-neutral-300">
                <td className="w-[18%] px-2 py-1 align-middle font-normal">Employee Name</td>
                <td className="w-[32%] px-2 py-1 align-middle font-bold uppercase">: {data.employee.nameUpper}</td>
                <td className="w-[18%] px-2 py-1 align-middle font-normal">Employee Code</td>
                <td className="w-[32%] px-2 py-1 align-middle font-bold">: {data.employee.empCode}</td>
              </tr>
              <tr className="border-b border-neutral-300">
                <td className="px-2 py-1 align-middle">Bank A/c No.</td>
                <td className="px-2 py-1 align-middle font-bold">: {data.employee.bankAccount}</td>
                <td className="px-2 py-1 align-middle">ESI A/c No</td>
                <td className="px-2 py-1 align-middle font-bold">: {data.employee.esiAccountNo}</td>
              </tr>
              <tr className="border-b border-neutral-300">
                <td className="px-2 py-1 align-middle">Department</td>
                <td className="px-2 py-1 align-middle font-bold uppercase">: {data.employee.department}</td>
                <td className="px-2 py-1 align-middle">Designation</td>
                <td className="px-2 py-1 align-middle font-bold uppercase">: {data.employee.designation}</td>
              </tr>
              <tr className="border-b border-neutral-300">
                <td className="px-2 py-1 align-middle">Bank Name</td>
                <td className="px-2 py-1 align-middle font-bold uppercase">: {data.employee.bankName}</td>
                <td className="px-2 py-1 align-middle">UAN</td>
                <td className="px-2 py-1 align-middle font-bold">: {data.employee.uan}</td>
              </tr>
              <tr className="border-b border-black">
                <td className="px-2 py-1 align-middle">Mobile</td>
                <td className="px-2 py-1 align-middle font-bold">: {data.employee.mobile}</td>
                <td className="px-2 py-1 align-middle"></td>
                <td className="px-2 py-1 align-middle"></td>
              </tr>
              <tr className="border-b border-neutral-300 bg-neutral-50 font-bold">
                <td className="px-2 py-1 align-middle">Month Days</td>
                <td className="px-2 py-1 align-middle font-bold">: {data.attendance.monthDays}</td>
                <td className="px-2 py-1 align-middle font-bold">Working Days</td>
                <td className="px-2 py-1 align-middle font-bold">: {data.attendance.workingDays}</td>
              </tr>
              <tr className="bg-neutral-50 font-bold">
                <td className="px-2 py-1 align-middle">LWP</td>
                <td className="px-2 py-1 align-middle font-bold">: {data.attendance.lwp}</td>
                <td className="px-2 py-1 align-middle"></td>
                <td className="px-2 py-1 align-middle"></td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="border border-black mb-2">
          <table className="w-full border-collapse text-[11px] leading-snug">
            <thead>
              <tr className="font-bold border-b border-black bg-neutral-100">
                <th className="border-r border-black px-2 py-1 text-left">Earnings</th>
                <th className="border-r border-black px-2 py-1 text-right">Scale Rs.</th>
                <th className="border-r border-black px-2 py-1 text-right">Amount Rs.</th>
                <th className="border-r border-black px-2 py-1 text-left">Deductions</th>
                <th className="border-r border-black px-2 py-1 text-right">Scale Rs.</th>
                <th className="px-2 py-1 text-right">Amount Rs.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ earning, deduction }, index) => (
                <tr key={index} className="border-b border-neutral-200">
                  <td className="border-r border-black px-2 py-1 font-medium">
                    {earning?.label || "-"}
                  </td>
                  <td className="border-r border-black px-2 py-1 text-right">
                    {earning ? formatMoneyValue(earning.amount) : "-"}
                  </td>
                  <td className="border-r border-black px-2 py-1 text-right font-medium">
                    {earning ? formatMoneyValue(earning.amount) : "-"}
                  </td>
                  <td className="border-r border-black px-2 py-1 font-medium">
                    {deduction?.label || "-"}
                  </td>
                  <td className="border-r border-black px-2 py-1 text-right">
                    {deduction ? formatMoneyValue(deduction.amount) : "-"}
                  </td>
                  <td className="px-2 py-1 text-right font-medium">
                    {deduction ? formatMoneyValue(deduction.amount) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-black text-[11px] font-bold bg-neutral-50">
                <td className="border-r border-black px-2 py-1">Total Earnings</td>
                <td className="border-r border-black px-2 py-1 text-right">{formatMoneyValue(totalEarnings)}</td>
                <td className="border-r border-black px-2 py-1 text-right">{formatMoneyValue(totalEarnings)}</td>
                <td className="border-r border-black px-2 py-1">Total Deductions</td>
                <td className="border-r border-black px-2 py-1 text-right">{formatMoneyValue(totalDeductions)}</td>
                <td className="px-2 py-1 text-right">{formatMoneyValue(totalDeductions)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        <section className="border border-black text-[11px] leading-snug">
          <div className="grid grid-cols-[76px_1fr] border-b border-black bg-neutral-50 px-2 py-1 font-extrabold">
            <span>Net Pay</span>
            <span>: {formatCurrency(netPay)}</span>
          </div>
          <div className="grid grid-cols-[76px_1fr] border-b border-black px-2 py-1 font-bold">
            <span>In Words</span>
            <span className="font-medium">: Rs. {numberToWords(netPay)} Only</span>
          </div>
          <div className="grid grid-cols-[76px_1fr] border-b border-black px-2 py-1 font-bold">
            <span>Salary</span>
            <span className="font-bold">: {formatCurrency(data.totals.salaryCredited)}</span>
          </div>
          <div className="border-b border-black px-2 py-1 font-bold text-neutral-800">
            This is Computer Generated Sheet, does not require Signature.
          </div>
          <div className="flex min-h-[28px] items-end justify-end p-1.5">
            <p className="font-extrabold text-[11px]">Authorised Signatory</p>
          </div>
        </section>
      </div>
    </article>
  );
}

export default function PayslipDocument({
  emp,
  payslip,
  companyId,
  className = "",
}) {
  const data = buildPayslipData({ emp, payslip, companyId });

  if (data.company.payslipVariant === "silver-star") {
    return <SilverPayslipLayout data={data} className={className} />;
  }

  return <NidhiPayslipLayout data={data} className={className} />;
}
