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
      ? "h-[78px] w-[180px]"
      : "h-[76px] w-[76px]"
    : isWideLogo
      ? "h-10 w-[120px]"
      : "h-14 w-14";

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
      className={`flex ${sizeClass} items-center justify-center rounded-2xl border border-neutral-300 bg-neutral-100 text-lg font-black text-neutral-700`}
    >
      {company.initials}
    </div>
  );
}

function DetailRow({ label, value, strong = false, uppercase = false }) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-2">
      <span className="text-neutral-500">{label}</span>
      <span className={strong ? "font-semibold" : ""}>
        {uppercase ? String(value || "N.A.").toUpperCase() : value || "N.A."}
      </span>
    </div>
  );
}

function NidhiPayslipLayout({ data, className }) {
  const rows = Array.from({ length: data.rowCount }, (_, index) => ({
    earning: data.earningRows[index],
    deduction: data.deductionRows[index],
  }));

  return (
    <article
      className={`mx-auto w-full min-w-[680px] max-w-[960px] bg-white text-black shadow-[0_20px_50px_rgba(15,23,42,0.14)] ${className}`}
      style={{ fontFamily: "Arial, sans-serif" }}
    >
      <div className="border-[2px] border-black px-5 py-5 sm:px-7 sm:py-7">
        <header className="grid grid-cols-[96px_1fr_96px] items-center gap-2 border-b-[2px] border-black pb-4">
          <div className="flex h-[78px] items-center justify-start overflow-hidden">
            <CompanyLogo company={data.company} large />
          </div>
          <div className="text-center">
            <h1 className="text-[15px] font-extrabold uppercase leading-tight sm:text-[18px]">
              {data.company.name}
            </h1>
            {data.company.addressLines.map((line) => (
              <p
                key={line}
                className="text-[9px] font-bold leading-snug sm:text-[11px]"
              >
                {line}
              </p>
            ))}
            <p className="mt-2 text-[14px] font-extrabold sm:text-[16px]">
              Pay Slip For the Month of {data.monthLabel}
            </p>
            <p className="text-[12px] font-extrabold">
              (From {data.dateFrom} To {data.dateTo})
            </p>
          </div>
          <div />
        </header>

        <section className="mt-4 border-[2px] border-black">
          <table className="w-full border-collapse text-[12px] leading-tight sm:text-[13px]">
            <tbody>
              <tr>
                <td className="w-[18%] px-1.5 pt-1 align-top font-normal">
                  Employee Name
                </td>
                <td className="w-[32%] px-1.5 pt-1 align-top font-bold">
                  : {data.employee.nameUpper}
                </td>
                <td className="w-[18%] px-1.5 pt-1 align-top font-normal">
                  Employee Code
                </td>
                <td className="w-[32%] px-1.5 pt-1 align-top font-bold">
                  : {data.employee.empCode}
                </td>
              </tr>
              <tr>
                <td className="px-1.5 align-top">Bank A/c No.</td>
                <td className="px-1.5 align-top font-bold">
                  : {data.employee.bankAccount}
                </td>
                <td className="px-1.5 align-top">Bank Name</td>
                <td className="px-1.5 align-top font-bold">
                  : {data.employee.bankName}
                </td>
              </tr>
              <tr>
                <td className="px-1.5 align-top">UAN</td>
                <td className="px-1.5 align-top font-bold">
                  : {data.employee.uan}
                </td>
                <td className="px-1.5 align-top">Mobile</td>
                <td className="px-1.5 align-top font-bold">
                  : {data.employee.mobile}
                </td>
              </tr>
              <tr>
                <td className="px-1.5 pb-2 align-top">Designation</td>
                <td className="px-1.5 pb-2 align-top font-bold uppercase">
                  : {data.employee.designation}
                </td>
                <td className="px-1.5 pb-2 align-top">Unit</td>
                <td className="px-1.5 pb-2 align-top font-bold uppercase">
                  : {data.employee.unit}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="grid grid-cols-2 border-t-[2px] border-black text-[12px] font-bold sm:text-[13px]">
            <div className="grid grid-cols-[1fr_auto] border-r-[2px] border-black px-1.5 py-1">
              <span>Total Paid Days</span>
              <span>: {data.employee.totalPaidDays}</span>
            </div>
            <div className="grid grid-cols-[1fr_auto] px-1.5 py-1">
              <span>LWP</span>
              <span>: {data.employee.lwp}</span>
            </div>
            <div className="grid grid-cols-[1fr_auto] border-r-[2px] border-black px-1.5 py-1">
              <span>Net Paid Days</span>
              <span>: {data.employee.netPaidDays}</span>
            </div>
            <div className="px-1.5 py-1" />
          </div>
        </section>

        <section className="mt-4 border-[2px] border-black">
          <table className="w-full border-collapse text-[11px] leading-tight sm:text-[13px]">
            <thead>
              <tr className="font-extrabold">
                <th className="border-r-[2px] border-black px-1.5 py-1 text-left">
                  Earnings
                </th>
                <th className="border-r-[2px] border-black px-1.5 py-1 text-right">
                  Scale Rs.
                </th>
                <th className="border-r-[2px] border-black px-1.5 py-1 text-right">
                  Amount Rs.
                </th>
                <th className="border-r-[2px] border-black px-1.5 py-1 text-left">
                  Deductions
                </th>
                <th className="border-r-[2px] border-black px-1.5 py-1 text-right">
                  Scale Rs.
                </th>
                <th className="px-1.5 py-1 text-right">Amount Rs.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ earning, deduction }, index) => (
                <tr key={index}>
                  <td className="border-r-[2px] border-black px-1.5 py-1">
                    {earning?.label || ""}
                  </td>
                  <td className="border-r-[2px] border-black px-1.5 py-1 text-right">
                    {earning ? formatMoneyValue(earning.amount) : ""}
                  </td>
                  <td className="border-r-[2px] border-black px-1.5 py-1 text-right">
                    {earning ? formatMoneyValue(earning.amount) : ""}
                  </td>
                  <td className="border-r-[2px] border-black px-1.5 py-1">
                    {deduction?.label || ""}
                  </td>
                  <td className="border-r-[2px] border-black px-1.5 py-1 text-right">
                    {deduction ? formatMoneyValue(deduction.amount) : ""}
                  </td>
                  <td className="px-1.5 py-1 text-right">
                    {deduction ? formatMoneyValue(deduction.amount) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-[2px] border-black text-[12px] font-extrabold sm:text-[13px]">
                <td className="border-r-[2px] border-black px-1.5 py-1.5">
                  Total Earnings
                </td>
                <td className="border-r-[2px] border-black px-1.5 py-1.5 text-right">
                  {formatMoneyValue(data.totals.earnings)}
                </td>
                <td className="border-r-[2px] border-black px-1.5 py-1.5 text-right">
                  {formatMoneyValue(data.totals.earnings)}
                </td>
                <td className="border-r-[2px] border-black px-1.5 py-1.5">
                  Total Deductions
                </td>
                <td className="border-r-[2px] border-black px-1.5 py-1.5 text-right">
                  {formatMoneyValue(data.totals.deductions)}
                </td>
                <td className="px-1.5 py-1.5 text-right">
                  {formatMoneyValue(data.totals.deductions)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        <section className="border-x-[2px] border-b-[2px] border-black text-[12px] sm:text-[13px]">
          <div className="grid grid-cols-[82px_1fr] border-b border-black bg-neutral-50 px-1.5 py-1.5 font-extrabold">
            <span>Net Pay</span>
            <span className="font-semibold">
              : {formatCurrency(data.totals.netPay)}
            </span>
          </div>
          <div className="grid grid-cols-[82px_1fr] px-1.5 py-1.5 font-extrabold">
            <span>In Words</span>
            <span className="font-normal">: Rs. {data.netPayInWords}</span>
          </div>
        </section>

        <section className="mt-4 border-[2px] border-black text-[12px] sm:text-[13px]">
          <div className="border-b-[2px] border-black bg-neutral-50 px-1.5 py-1 font-extrabold">
            Miscellaneous Information
          </div>
          <div className="grid grid-cols-[1fr_180px] border-b border-black">
            <div className="px-1.5 py-1">SALARY</div>
            <div className="border-l-[2px] border-black px-1.5 py-1 text-right font-bold">
              {formatMoneyValue(data.totals.salaryCredited)}
            </div>
          </div>
          <div className="min-h-[120px] px-1.5 py-3">
            <p className="italic">
              TDS Deducted Upto {data.monthLabel}: Rs. Nil
            </p>
            <p className="font-extrabold">
              This is Computer Generated Sheet, does not require Signature.
            </p>
            <div className="mt-16 flex items-end justify-between gap-4">
              <div className="text-[11px] font-bold text-neutral-600">
                Paid On: {formatDate(data.payDate)}
              </div>
              <div className="text-right">
                <p className="text-[14px] font-extrabold">
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
  const earnings = [
    { label: "BASIC", amount: Number(data.components.basicSalary || 0) },
    { label: "HRA", amount: Number(data.components.hra || 0) },
    {
      label: "CON.AL",
      amount: Number(data.components.conveyanceAllowance || 0),
    },
    { label: "PERFO", amount: Number(data.components.bonus || 0) },
  ];

  const deductions = [
    {
      label: "PROFESSIONAL TAX",
      amount: Number(data.components.professionalTax || 0),
    },
  ];

  const rowCount = Math.max(earnings.length, deductions.length, 4);

  const rows = Array.from({ length: rowCount }, (_, index) => ({
    earning: earnings[index] ?? null,
    deduction: deductions[index] ?? null,
  }));

  const totalEarnings = earnings.reduce((sum, row) => sum + row.amount, 0);
  const totalDeductions = deductions.reduce((sum, row) => sum + row.amount, 0);

  return {
    rows,
    totalEarnings,
    totalDeductions,
    netPay: totalEarnings - totalDeductions,
  };
}

function SilverPayslipLayout({ data, className }) {
  const { rows, totalEarnings, totalDeductions, netPay } =
    buildSilverTableRows(data);

  return (
    <article
      className={`mx-auto w-full min-w-[720px] max-w-[960px] bg-white text-black shadow-[0_20px_50px_rgba(15,23,42,0.14)] ${className}`}
      style={{ fontFamily: "Arial, sans-serif" }}
    >
      <div className="border border-black px-4 py-5 sm:px-6 sm:py-6">
        <header className="grid grid-cols-[180px_1fr_180px] items-center gap-2 border-b border-black pb-4">
          <div className="flex h-[82px] items-center justify-start overflow-hidden">
            <CompanyLogo company={data.company} large />
          </div>
          <div className="text-center">
            <h1 className="text-[13px] font-extrabold uppercase leading-tight sm:text-[16px]">
              {data.company.name}
            </h1>
            {data.company.addressLines.map((line) => (
              <p
                key={line}
                className="text-[9px] font-bold uppercase leading-snug sm:text-[10px]"
              >
                {line}
              </p>
            ))}
            <p className="mt-2 text-[13px] font-extrabold sm:text-[15px]">
              Pay Slip For the Month of {data.monthLabel}
            </p>
            <p className="text-[12px] font-extrabold">
              (From {data.dateFrom} To {data.dateTo})
            </p>
          </div>
          <div />
        </header>

        <section className="mt-4 border border-black">
          <table className="w-full border-collapse text-[12px] leading-tight sm:text-[13px]">
            <tbody>
              <tr>
                <td className="w-[18%] px-1.5 pt-1 align-top">Employee Name</td>
                <td className="w-[32%] px-1.5 pt-1 align-top font-bold uppercase">
                  : {data.employee.nameUpper}
                </td>
                <td className="w-[18%] px-1.5 pt-1 align-top">Employee Code</td>
                <td className="w-[32%] px-1.5 pt-1 align-top font-bold">
                  : {data.employee.empCode}
                </td>
              </tr>
              <tr>
                <td className="px-1.5 align-top">Bank A/c No.</td>
                <td className="px-1.5 align-top font-bold">
                  : {data.employee.bankAccount}
                </td>
                <td className="px-1.5 align-top">ESI A/c No</td>
                <td className="px-1.5 align-top font-bold">
                  : {data.employee.esiAccountNo}
                </td>
              </tr>
              <tr>
                <td className="px-1.5 align-top">Department</td>
                <td className="px-1.5 align-top font-bold uppercase">
                  : {data.employee.department}
                </td>
                <td className="px-1.5 align-top">Designation</td>
                <td className="px-1.5 align-top font-bold uppercase">
                  : {data.employee.designation}
                </td>
              </tr>
              <tr>
                <td className="px-1.5 align-top">Bank Name</td>
                <td className="px-1.5 align-top font-bold uppercase">
                  : {data.employee.bankName}
                </td>
                <td className="px-1.5 align-top">UAN</td>
                <td className="px-1.5 align-top font-bold">
                  : {data.employee.uan}
                </td>
              </tr>
              <tr>
                <td className="px-1.5 pb-1 align-top">Mobile</td>
                <td className="px-1.5 pb-1 align-top font-bold">
                  : {data.employee.mobile}
                </td>
                <td className="px-1.5 pb-1 align-top"></td>
                <td className="px-1.5 pb-1 align-top"></td>
              </tr>
            </tbody>
          </table>

          <div className="grid grid-cols-2 border-t border-black text-[12px] font-bold sm:text-[13px]">
            <div className="grid grid-cols-[1fr_auto] border-r border-black px-1.5 py-1">
              <span>Month Days</span>
              <span>: {data.attendance.monthDays}</span>
            </div>
            <div className="grid grid-cols-[1fr_auto] px-1.5 py-1">
              <span>Working Days</span>
              <span>: {data.attendance.workingDays}</span>
            </div>
            <div className="grid grid-cols-[1fr_auto] border-r border-black px-1.5 py-1">
              <span>LWP</span>
              <span>: {data.attendance.lwp}</span>
            </div>
            <div className="px-1.5 py-1" />
          </div>
        </section>

        <section className="mt-4 border border-black">
          <table className="w-full border-collapse text-[11px] leading-tight sm:text-[13px]">
            <thead>
              <tr className="border-b border-black font-extrabold">
                <th className="border-r border-black px-1.5 py-1 text-left">
                  Earnings
                </th>
                <th className="border-r border-black px-1.5 py-1 text-right">
                  Scale Rs.
                </th>
                <th className="border-r border-black px-1.5 py-1 text-right">
                  Amount Rs.
                </th>
                <th className="border-r border-black px-1.5 py-1 text-left">
                  Deductions
                </th>
                <th className="border-r border-black px-1.5 py-1 text-right">
                  Scale Rs.
                </th>
                <th className="px-1.5 py-1 text-right">Amount Rs.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ earning, deduction }, index) => (
                <tr key={index}>
                  <td className="border-r border-black px-1.5 py-0.5">
                    {earning?.label || "-"}
                  </td>
                  <td className="border-r border-black px-1.5 py-0.5 text-right">
                    {earning ? formatMoneyValue(earning.amount) : "-"}
                  </td>
                  <td className="border-r border-black px-1.5 py-0.5 text-right">
                    {earning ? formatMoneyValue(earning.amount) : "-"}
                  </td>
                  <td className="border-r border-black px-1.5 py-0.5">
                    {deduction?.label || "-"}
                  </td>
                  <td className="border-r border-black px-1.5 py-0.5 text-right">
                    {deduction ? formatMoneyValue(deduction.amount) : "-"}
                  </td>
                  <td className="px-1.5 py-0.5 text-right">
                    {deduction ? formatMoneyValue(deduction.amount) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-black text-[12px] font-extrabold sm:text-[13px]">
                <td className="border-r border-black px-1.5 py-1">
                  Total Earnings
                </td>
                <td className="border-r border-black px-1.5 py-1 text-right">
                  {formatMoneyValue(totalEarnings)}
                </td>
                <td className="border-r border-black px-1.5 py-1 text-right">
                  {formatMoneyValue(totalEarnings)}
                </td>
                <td className="border-r border-black px-1.5 py-1">
                  Total Deductions
                </td>
                <td className="border-r border-black px-1.5 py-1 text-right">
                  {formatMoneyValue(totalDeductions)}
                </td>
                <td className="px-1.5 py-1 text-right">
                  {formatMoneyValue(totalDeductions)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        <section className="border-x border-b border-black text-[12px] sm:text-[13px]">
          <div className="grid grid-cols-[82px_1fr] border-b border-black px-1.5 py-1 font-extrabold">
            <span>Net Pay</span>
            <span>: {formatCurrency(netPay)}</span>
          </div>
          <div className="grid grid-cols-[82px_1fr] border-b border-black px-1.5 py-1 font-extrabold">
            <span>In Words</span>
            <span className="font-normal">: Rs. {numberToWords(netPay)} Only</span>
          </div>
          <div className="border-b border-black px-1.5 py-1 font-extrabold">
            This is Computer Generated Sheet, does not require Signature.
          </div>
          <div className="flex min-h-[60px] items-end justify-end px-4 py-3">
            <p className="font-extrabold">Authorised Signatory</p>
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
