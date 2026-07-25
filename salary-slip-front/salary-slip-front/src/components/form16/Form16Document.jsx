import {
  FORM16_COMPANY_DETAILS,
  formatForm16Amount,
} from "../../utils/form16Utils";

function DocPage({ children, footer, title }) {
  return (
    <section
      className="mx-auto w-full min-w-[760px] max-w-[960px] bg-white px-8 py-7 text-black shadow-[0_22px_50px_rgba(15,23,42,0.12)]"
      style={{ fontFamily: '"Times New Roman", serif' }}
      aria-label={title}
    >
      {children}
      <div className="mt-6 border-t border-black pt-2 text-right text-[11px] font-bold">
        {footer}
      </div>
    </section>
  );
}

function TC({ children, className = "", as: Tag = "td", colSpan, rowSpan }) {
  return (
    <Tag
      colSpan={colSpan}
      rowSpan={rowSpan}
      className={`border border-black px-2 py-1 align-top text-[11px] leading-snug ${className}`}
    >
      {children}
    </Tag>
  );
}

function fmt(v) {
  return formatForm16Amount(v);
}

function VerificationTable({ place, issueDate, signatoryName }) {
  return (
    <table className="w-full border-collapse">
      <tbody>
        <tr>
          <TC className="font-bold w-28">Place</TC>
          <TC>{place}</TC>
          <TC rowSpan={2} className="align-middle text-center">
            (Signature of person responsible for deduction of tax)
          </TC>
        </tr>
        <tr>
          <TC className="font-bold">Date</TC>
          <TC>{issueDate}</TC>
        </tr>
        <tr>
          <TC className="font-bold">Designation:</TC>
          <TC />
          <TC>
            <span className="font-bold">Full Name:</span> {signatoryName}
          </TC>
        </tr>
      </tbody>
    </table>
  );
}

export default function Form16Document({ data }) {
  const {
    assessmentYear,
    company,
    employee,
    employmentPeriod,
    issueDate,
    partA,
    partB,
  } = data;

  const sig = FORM16_COMPANY_DETAILS.signatoryName;

  return (
    <div className="space-y-8">
      {/* ════════════════════════════════════════
          PART A
      ════════════════════════════════════════ */}
      <DocPage title="Form 16 Part A" footer="Page 1 of 1">
        {/* Title block — each line in its own full-width bordered row */}
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <TC className="text-center text-[18px] font-bold tracking-wide py-2">
                FORM NO. 16
              </TC>
            </tr>
            <tr>
              <TC className="text-center text-[12px] italic">
                [See rule 31(1)(a)]
              </TC>
            </tr>
            <tr>
              <TC className="text-center text-[16px] font-bold py-1">PART A</TC>
            </tr>
            <tr>
              <TC className="text-center text-[12px] font-bold leading-snug">
                Certificate under section 203 of the Income-tax Act, 1961 for
                Tax deducted at source on Salary
              </TC>
            </tr>
          </tbody>
        </table>

        {/* Certificate No. | Last updated on — 2 cells each combining label+value */}
        <table className="-mt-[1px] w-full border-collapse">
          <tbody>
            <tr>
              <TC>
                <span className="font-bold">Certificate No.</span>{" "}
                {partA.certificateNo}
              </TC>
              <TC>
                <span className="font-bold">Last updated on</span>{" "}
                {partA.lastUpdated}
              </TC>
            </tr>
          </tbody>
        </table>

        {/* Employer | Employee — header row then value row */}
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <TC className="font-bold w-1/2">
                Name and address of the Employer
              </TC>
              <TC className="font-bold w-1/2">
                Name and address of the Employee
              </TC>
            </tr>
            <tr>
              <TC>
                <div className="font-bold">{company.name}</div>
                {company.addressLines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </TC>
              <TC>
                <div className="font-bold">{employee.nameUpper}</div>
              </TC>
            </tr>
          </tbody>
        </table>

        {/* PAN / TAN / Employee PAN / Ref No — all labels in one row, all values in next */}
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <TC className="font-bold">PAN of the Deductor</TC>
              <TC className="font-bold">TAN of the Deductor</TC>
              <TC className="font-bold">PAN of the Employee</TC>
              <TC className="font-bold">
                Employee Reference No. provided by the Employer (If available)
              </TC>
            </tr>
            <tr>
              <TC>{company.deductorPan}</TC>
              <TC>{company.deductorTan}</TC>
              <TC>{employee.pan}</TC>
              <TC>{employee.referenceNo}</TC>
            </tr>
          </tbody>
        </table>

        {/* CIT (TDS) | Assessment Year | Period with the Employer (From | To) */}
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <TC className="font-bold" rowSpan={2}>
                CIT (TDS)
              </TC>
              <TC className="font-bold" rowSpan={2}>
                Assessment Year
              </TC>
              <TC className="font-bold text-center" colSpan={2}>
                Period with the Employer
              </TC>
            </tr>
            <tr>
              <TC className="font-bold">From</TC>
              <TC className="font-bold">To</TC>
            </tr>
            <tr>
              <TC>{partA.commissioner}</TC>
              <TC>{assessmentYear}</TC>
              <TC>{employmentPeriod.from}</TC>
              <TC>{employmentPeriod.to}</TC>
            </tr>
          </tbody>
        </table>

        {/* Quarterly TDS summary — header inside table */}
        <table className="-mt-[1px] w-full border-collapse">
          <thead>
            <tr>
              <TC as="th" className="font-bold text-center" colSpan={5}>
                Summary of amount paid/credited and tax deducted at source
                thereon in respect of the employee
              </TC>
            </tr>
            <tr>
              <TC as="th" className="font-bold">
                Quarter(s)
              </TC>
              <TC as="th" className="font-bold">
                Receipt Numbers of original statements of TDS under sub-section
                (3) of section 200
              </TC>
              <TC as="th" className="font-bold text-right">
                Amount paid/credited
              </TC>
              <TC as="th" className="font-bold text-right">
                Amount of tax deducted (Rs.)
              </TC>
              <TC as="th" className="font-bold text-right">
                Amount of tax deposited/remitted (Rs.)
              </TC>
            </tr>
          </thead>
          <tbody>
            {partA.quarterRows.map((row) => (
              <tr key={row.quarter}>
                <TC>{row.quarter}</TC>
                <TC>{row.receiptNumber || ""}</TC>
                <TC className="text-right">{fmt(row.amountPaid)}</TC>
                <TC className="text-right">{fmt(row.tdsDeducted)}</TC>
                <TC className="text-right">{fmt(row.tdsDeposited)}</TC>
              </tr>
            ))}
            <tr>
              <TC className="font-bold" colSpan={2}>
                Total (Rs.)
              </TC>
              <TC className="text-right font-bold">
                {fmt(partA.totalAmountPaid)}
              </TC>
              <TC className="text-right font-bold">
                {fmt(partA.totalTaxDeducted)}
              </TC>
              <TC className="text-right font-bold">
                {fmt(partA.totalTaxDeposited)}
              </TC>
            </tr>
          </tbody>
        </table>

        {/* Section I — Book Adjustment */}
        <table className="-mt-[1px] w-full border-collapse">
          <thead>
            <tr>
              <TC as="th" className="font-bold text-center" colSpan={6}>
                I. DETAILS OF TAX DEDUCTED AND DEPOSITED IN THE CENTRAL
                GOVERNMENT ACCOUNT THROUGH BOOK ADJUSTMENT
              </TC>
            </tr>
            <tr>
              <TC
                as="th"
                className="italic text-center text-[10px]"
                colSpan={6}
              >
                (The Deductor to provide payment wise details of tax deducted
                and deposited with respect to the deductee)
              </TC>
            </tr>
            <tr>
              <TC as="th" className="font-bold" rowSpan={2}>
                S. No.
              </TC>
              <TC as="th" className="font-bold" rowSpan={2}>
                Tax Deposited in respect of the Deductee (Rs.)
              </TC>
              <TC as="th" className="font-bold text-center" colSpan={4}>
                Book identification number (BIN)
              </TC>
            </tr>
            <tr>
              <TC as="th" className="font-bold">
                Receipt numbers of Form No. 24G
              </TC>
              <TC as="th" className="font-bold">
                DDO Sequence Number in the Book Adjustment Mini Statement
              </TC>
              <TC as="th" className="font-bold">
                Date on which tax deposited (dd/mm/yyyy)
              </TC>
              <TC as="th" className="font-bold">
                Status of matching with Form No. 24G
              </TC>
            </tr>
          </thead>
          <tbody>
            <tr>
              <TC className="font-bold" colSpan={6}>
                Total (Rs.)
              </TC>
            </tr>
          </tbody>
        </table>

        {/* Section II — Challan */}
        <table className="-mt-[1px] w-full border-collapse">
          <thead>
            <tr>
              <TC as="th" className="font-bold text-center" colSpan={6}>
                II. DETAILS OF TAX DEDUCTED AND DEPOSITED IN THE CENTRAL
                GOVERNMENT ACCOUNT THROUGH CHALLAN
              </TC>
            </tr>
            <tr>
              <TC
                as="th"
                className="italic text-center text-[10px]"
                colSpan={6}
              >
                (The Deductor to provide payment wise details of tax deducted
                and deposited with respect to the deductee)
              </TC>
            </tr>
            <tr>
              <TC as="th" className="font-bold" rowSpan={2}>
                S. No.
              </TC>
              <TC as="th" className="font-bold" rowSpan={2}>
                Tax Deposited in respect of the Deductee (Rs.)
              </TC>
              <TC as="th" className="font-bold text-center" colSpan={4}>
                Book identification number (BIN)
              </TC>
            </tr>
            <tr>
              <TC as="th" className="font-bold">
                BSR Code of the Bank Branch
              </TC>
              <TC as="th" className="font-bold">
                Date on which tax deposited (dd/mm/yyyy)
              </TC>
              <TC as="th" className="font-bold">
                Challan Serial Number
              </TC>
              <TC as="th" className="font-bold">
                Status of matching with OLTAS
              </TC>
            </tr>
          </thead>
          <tbody>
            <tr>
              <TC className="font-bold" colSpan={6}>
                Total (Rs.)
              </TC>
            </tr>
          </tbody>
        </table>

        {/* Verification — heading + paragraph inside bordered rows */}
        <table className="-mt-[1px] w-full border-collapse">
          <tbody>
            <tr>
              <TC className="text-center font-bold text-[13px]">
                Verification
              </TC>
            </tr>
            <tr>
              <TC className="text-[11px] leading-relaxed">
                I, <span className="font-bold underline">{sig}</span>,
                son/daughter of{" "}
                <span className="inline-block min-w-[80px] border-b border-black" />{" "}
                working in the capacity of{" "}
                <span className="inline-block min-w-[80px] border-b border-black" />{" "}
                (designation) do hereby certify that a sum of Rs.{" "}
                <span className="font-bold underline">
                  {fmt(partA.totalTaxDeducted)}
                </span>{" "}
                [Rs.{" "}
                <span className="font-bold underline">
                  {fmt(partA.totalTaxDeducted)}
                </span>{" "}
                (in words)] has been deducted and deposited to the credit of the
                Central Government. I further certify that the information given
                above is true, complete and correct and is based on the book of
                accounts, documents, TDS statements, TDS deposited and other
                available records.
              </TC>
            </tr>
          </tbody>
        </table>
        <div className="-mt-[1px]">
          <VerificationTable
            place={company.place}
            issueDate={issueDate}
            signatoryName={sig}
          />
        </div>
      </DocPage>

      {/* ════════════════════════════════════════
          PART B — Page 1 of 3
      ════════════════════════════════════════ */}
      <DocPage title="Form 16 Part B Page 1" footer="Page 1 of 3">
        {/* TAN / Name / PAN / AY — labels row then values row */}
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <TC className="font-bold">TAN of Employer</TC>
              <TC className="font-bold">Name of Employee</TC>
              <TC className="font-bold">PAN of Employee</TC>
              <TC className="font-bold">Assessment Year</TC>
            </tr>
            <tr>
              <TC>{company.deductorTan}</TC>
              <TC>{employee.nameUpper}</TC>
              <TC>{employee.pan}</TC>
              <TC>{assessmentYear}</TC>
            </tr>
          </tbody>
        </table>

        {/* ONE TABLE: PART B heading + Details + all computation rows — zero gaps */}
        <table className="-mt-[1px] w-full border-collapse">
          <tbody>
            {/* PART B (Annexure-I) heading */}
            <tr>
              <TC
                className="text-center text-[15px] font-bold py-1"
                colSpan={4}
              >
                PART B (Annexure-I)
              </TC>
            </tr>

            {/* Details row — full-width, bold, left-aligned */}
            <tr>
              <TC className="font-bold text-[11px]" colSpan={4}>
                Details of Salary paid and any other income and tax deducted
              </TC>
            </tr>

            {/* A — opting out */}
            <tr>
              <TC className="font-bold w-10">A</TC>
              <TC className="font-bold" colSpan={2}>
                Whether opting out of taxation u/s 115BAC(1A)?
              </TC>
              <TC className="font-bold text-right w-32">
                {partB.optingOut115BAC}
              </TC>
            </tr>

            {/* 1. Gross Salary — section header */}
            <tr>
              <TC className="font-bold">1.</TC>
              <TC className="font-bold" colSpan={3}>
                Gross Salary
              </TC>
            </tr>
            <tr>
              <TC>(a)</TC>
              <TC>Salary as per provisions contained in section 17(1)</TC>
              <TC className="text-right w-12">Rs.</TC>
              <TC className="text-right">{fmt(partB.salary17_1)}</TC>
            </tr>
            <tr>
              <TC>(b)</TC>
              <TC>
                Value of perquisites under section 17(2) (as per Form No. 12BA,
                wherever applicable)
              </TC>
              <TC className="text-right">Rs.</TC>
              <TC className="text-right">{fmt(partB.perquisites)}</TC>
            </tr>
            <tr>
              <TC>(c)</TC>
              <TC>
                Profits in lieu of salary under section 17(3) (as per Form No.
                12BA, wherever applicable)
              </TC>
              <TC className="text-right">Rs.</TC>
              <TC className="text-right">{fmt(partB.profitsInLieu)}</TC>
            </tr>
            <tr>
              <TC>(d)</TC>
              <TC>Total</TC>
              <TC />
              <TC className="text-right">Rs. {fmt(partB.grossSalary)}</TC>
            </tr>
            <tr>
              <TC>(e)</TC>
              <TC>
                Reported total amount of salary received from other employer(s)
              </TC>
              <TC />
              <TC className="text-right">
                Rs. {fmt(partB.salaryFromOtherEmployers)}
              </TC>
            </tr>

            {/* 2. Less: Allowances — section header */}
            <tr>
              <TC className="font-bold">2.</TC>
              <TC className="font-bold" colSpan={3}>
                Less: Allowance to the extent exempt under section 10
              </TC>
            </tr>
            <tr>
              <TC>(a)</TC>
              <TC>Travel concession or assistance under section 10(5)</TC>
              <TC className="text-right">Rs.</TC>
              <TC className="text-right">
                {fmt(partB.section10.travelConcession)}
              </TC>
            </tr>
            <tr>
              <TC>(b)</TC>
              <TC>Death-cum-retirement gratuity under section 10(10)</TC>
              <TC className="text-right">Rs.</TC>
              <TC className="text-right">{fmt(partB.section10.gratuity)}</TC>
            </tr>
            <tr>
              <TC>(c)</TC>
              <TC>Commuted value of pension under section 10(10A)</TC>
              <TC className="text-right">Rs.</TC>
              <TC className="text-right">
                {fmt(partB.section10.commutedPension)}
              </TC>
            </tr>
            <tr>
              <TC>(d)</TC>
              <TC>
                Cash equivalent of leave salary encashment under section
                10(10AA)
              </TC>
              <TC className="text-right">Rs.</TC>
              <TC className="text-right">
                {fmt(partB.section10.leaveEncashment)}
              </TC>
            </tr>
            <tr>
              <TC>(e)</TC>
              <TC>House rent allowance under section 10(13A)</TC>
              <TC className="text-right">Rs.</TC>
              <TC className="text-right">{fmt(partB.section10.hra)}</TC>
            </tr>
            <tr>
              <TC>(f)</TC>
              <TC>Other special allowances under section 10(14)</TC>
              <TC className="text-right">Rs.</TC>
              <TC className="text-right">
                {fmt(partB.section10.specialAllowance)}
              </TC>
            </tr>
            {/* 2.(g) spans description row + amount row */}
            <tr>
              <TC>(g)</TC>
              <TC colSpan={3}>
                Amount of any other exemption under section 10
              </TC>
            </tr>
            <tr>
              <TC />
              <TC />
              <TC className="text-right">Rs.</TC>
              <TC className="text-right">
                {fmt(partB.section10.otherExemption)}
              </TC>
            </tr>
            <tr>
              <TC>(h)</TC>
              <TC>Total amount of any other exemption under section 10</TC>
              <TC className="text-right">Rs.</TC>
              <TC className="text-right">
                {fmt(partB.section10.otherExemption)}
              </TC>
            </tr>
            <tr>
              <TC>(i)</TC>
              <TC>
                Total amount of exemption claimed under section 10
                [2(a)+2(b)+2(c)+2(d)+2(e)+2(f)+2(h)]
              </TC>
              <TC />
              <TC className="text-right">Rs. {fmt(partB.totalSection10)}</TC>
            </tr>

            {/* 3 */}
            <tr>
              <TC>3.</TC>
              <TC>
                Total amount of salary received from current employer
                [1(d)-2(i)]
              </TC>
              <TC />
              <TC className="text-right">
                Rs. {fmt(partB.grossSalary - partB.totalSection10)}
              </TC>
            </tr>

            {/* 4. Less: Deductions — section header */}
            <tr>
              <TC className="font-bold">4.</TC>
              <TC className="font-bold" colSpan={3}>
                Less: Deductions under section 16
              </TC>
            </tr>
            <tr>
              <TC>(a)</TC>
              <TC>Standard deduction under section 16(ia)</TC>
              <TC className="text-right">Rs.</TC>
              <TC className="text-right">
                {fmt(partB.deductions16.standardDeduction)}
              </TC>
            </tr>
            <tr>
              <TC>(b)</TC>
              <TC>Entertainment allowance under section 16(ii)</TC>
              <TC className="text-right">Rs.</TC>
              <TC className="text-right">
                {fmt(partB.deductions16.entertainmentAllowance)}
              </TC>
            </tr>
            <tr>
              <TC>(c)</TC>
              <TC>Tax on employment under section 16(iii)</TC>
              <TC className="text-right">Rs.</TC>
              <TC className="text-right">
                {fmt(partB.deductions16.taxOnEmployment)}
              </TC>
            </tr>

            {/* 5 */}
            <tr>
              <TC>5.</TC>
              <TC>
                Total amount of deductions under section 16 [4(a)+4(b)+4(c)]
              </TC>
              <TC />
              <TC className="text-right">Rs. {fmt(partB.totalDeductions16)}</TC>
            </tr>

            {/* 6 */}
            <tr>
              <TC>6.</TC>
              <TC>
                Income chargeable under the head &ldquo;Salaries&rdquo;
                [3+1(e)-5]
              </TC>
              <TC />
              <TC className="text-right">Rs. {fmt(partB.incomeFromSalary)}</TC>
            </tr>

            {/* 7 — header only, no amount */}
            <tr>
              <TC>7.</TC>
              <TC colSpan={3}>
                Add: Any other income reported by the employee under as per
                section 192 (2B)
              </TC>
            </tr>
            <tr>
              <TC>(a)</TC>
              <TC>
                Income (or admissible loss) from house property reported by
                employee offered for TDS
              </TC>
              <TC className="text-right">Rs.</TC>
              <TC className="text-right">
                {fmt(partB.otherIncome.houseProperty)}
              </TC>
            </tr>
            <tr>
              <TC>(b)</TC>
              <TC>Income under the head Other Sources offered for TDS</TC>
              <TC className="text-right">Rs.</TC>
              <TC className="text-right">
                {fmt(partB.otherIncome.otherSources)}
              </TC>
            </tr>

            {/* 8 */}
            <tr>
              <TC>8.</TC>
              <TC>
                Total amount of other income reported by the employee
                [7(a)+7(b)]
              </TC>
              <TC />
              <TC className="text-right">
                Rs.{" "}
                {fmt(
                  partB.otherIncome.houseProperty +
                    partB.otherIncome.otherSources,
                )}
              </TC>
            </tr>

            {/* 9 */}
            <tr>
              <TC>9.</TC>
              <TC>Gross total income (6+8)</TC>
              <TC />
              <TC className="text-right">Rs. {fmt(partB.grossTotalIncome)}</TC>
            </tr>

            {/* 10. Deductions under Chapter VI-A — section header */}
            <tr>
              <TC className="font-bold">10.</TC>
              <TC className="font-bold" colSpan={3}>
                Deductions under Chapter VI-A
              </TC>
            </tr>
            {/* Column sub-headers for Chapter VI-A */}
            <tr>
              <TC />
              <TC />
              <TC className="font-bold text-right">Gross Amount</TC>
              <TC className="font-bold text-right">Deductible Amount</TC>
            </tr>

            {/* 10.(a) – 10.(d) */}
            <tr>
              <TC>(a)</TC>
              <TC>
                Deduction in respect of life insurance premia, contributions to
                provident fund etc. under section 80C
              </TC>
              <TC className="text-right">
                Rs. {fmt(partB.chapterVIA.section80C.gross)}
              </TC>
              <TC className="text-right">
                Rs. {fmt(partB.chapterVIA.section80C.deductible)}
              </TC>
            </tr>
            <tr>
              <TC>(b)</TC>
              <TC>
                Deduction in respect of contribution to certain pension funds
                under section 80CCC
              </TC>
              <TC className="text-right">
                Rs. {fmt(partB.chapterVIA.section80CCC.gross)}
              </TC>
              <TC className="text-right">
                Rs. {fmt(partB.chapterVIA.section80CCC.deductible)}
              </TC>
            </tr>
            <tr>
              <TC>(c)</TC>
              <TC>
                Deduction in respect of contribution by taxpayer to pension
                scheme under section 80CCD (1)
              </TC>
              <TC className="text-right">
                Rs. {fmt(partB.chapterVIA.section80CCD1.gross)}
              </TC>
              <TC className="text-right">
                Rs. {fmt(partB.chapterVIA.section80CCD1.deductible)}
              </TC>
            </tr>
            <tr>
              <TC>(d)</TC>
              <TC>Total deduction under section 80C, 80CCC and 80CCD(1)</TC>
              <TC className="text-right">
                Rs.{" "}
                {fmt(
                  partB.chapterVIA.section80C.deductible +
                    partB.chapterVIA.section80CCC.deductible +
                    partB.chapterVIA.section80CCD1.deductible,
                )}
              </TC>
              <TC className="text-right">
                Rs.{" "}
                {fmt(
                  partB.chapterVIA.section80C.deductible +
                    partB.chapterVIA.section80CCC.deductible +
                    partB.chapterVIA.section80CCD1.deductible,
                )}
              </TC>
            </tr>
          </tbody>
        </table>
      </DocPage>

      {/* ════════════════════════════════════════
          PART B — Page 2 of 3
      ════════════════════════════════════════ */}
      <DocPage title="Form 16 Part B Page 2" footer="Page 2 of 3">
        {/* ONE TABLE: 10(e)-10(n) + rows 11-20 + Verification — zero gaps */}
        <table className="w-full border-collapse">
          <tbody>
            {/* Column sub-headers */}
            <tr>
              <TC />
              <TC />
              <TC className="font-bold text-right">Gross Amount</TC>
              <TC className="font-bold text-right">Qualifying Amount</TC>
              <TC className="font-bold text-right">Deductible Amount</TC>
            </tr>

            {/* (e)–(j): no qualifying column (show Nil) */}
            {[
              [
                "(e)",
                "Deductions in respect of amount paid/deposited to notified pension scheme under section 80CCD (1B)",
                partB.chapterVIA.section80CCD1B.gross,
                partB.chapterVIA.section80CCD1B.deductible,
              ],
              [
                "(f)",
                "Deduction in respect of contribution by Employer to pension scheme under section 80CCD (2)",
                partB.chapterVIA.section80CCD2.gross,
                partB.chapterVIA.section80CCD2.deductible,
              ],
              [
                "(g)",
                "Deduction in respect of health insurance premia under section 80D",
                partB.chapterVIA.section80D.gross,
                partB.chapterVIA.section80D.deductible,
              ],
              [
                "(h)",
                "Deduction in respect of interest on loan taken for higher education under section 80E",
                partB.chapterVIA.section80E.gross,
                partB.chapterVIA.section80E.deductible,
              ],
              [
                "(i)",
                "Deduction in respect of contribution by the employee to Agnipath Scheme under section 80CCH",
                partB.chapterVIA.section80CCHEmp.gross,
                partB.chapterVIA.section80CCHEmp.deductible,
              ],
              [
                "(j)",
                "Deduction in respect of contribution by the Central Government to Agnipath Scheme under section 80CCH",
                partB.chapterVIA.section80CCHGovt.gross,
                partB.chapterVIA.section80CCHGovt.deductible,
              ],
            ].map(([code, label, gross, deductible]) => (
              <tr key={code}>
                <TC className="w-10">{code}</TC>
                <TC>{label}</TC>
                <TC className="text-right">Rs. {fmt(gross)}</TC>
                <TC className="text-right">Rs. {fmt(0)}</TC>
                <TC className="text-right">Rs. {fmt(deductible)}</TC>
              </tr>
            ))}

            {/* (k)–(n): with qualifying column */}
            {[
              [
                "(k)",
                "Total Deduction in respect of donations to certain funds, charitable institutions, etc. under section 80G",
                partB.chapterVIA.section80G.gross,
                partB.chapterVIA.section80G.qualifying,
                partB.chapterVIA.section80G.deductible,
              ],
              [
                "(l)",
                "Deduction in respect of interest on deposits in savings account under section 80TTA",
                partB.chapterVIA.section80TTA.gross,
                partB.chapterVIA.section80TTA.qualifying,
                partB.chapterVIA.section80TTA.deductible,
              ],
              [
                "(m)",
                "Amount deductible under any other provision(s) of Chapter VI-A",
                partB.chapterVIA.otherVIA.gross,
                partB.chapterVIA.otherVIA.qualifying,
                partB.chapterVIA.otherVIA.deductible,
              ],
              [
                "(n)",
                "Total of amount deductible under any other provision(s) of Chapter VI-A",
                partB.chapterVIA.otherVIA.gross,
                partB.chapterVIA.otherVIA.qualifying,
                partB.chapterVIA.otherVIA.deductible,
              ],
            ].map(([code, label, gross, qualifying, deductible]) => (
              <tr key={code}>
                <TC className="w-10">{code}</TC>
                <TC>{label}</TC>
                <TC className="text-right">Rs. {fmt(gross)}</TC>
                <TC className="text-right">Rs. {fmt(qualifying ?? 0)}</TC>
                <TC className="text-right">Rs. {fmt(deductible)}</TC>
              </tr>
            ))}

            {/* 11–20 tax computation — label spans cols 2-4, amount in col 5 */}
            {[
              [
                "11.",
                "Aggregate of deductible amount under Chapter VI-A [10(d)+10(e)+10(f)+10(g)+10(h)+10(i)+10(j)+10(k)+10(l)+10(n)]",
                partB.aggregateChapterVIA,
              ],
              ["12.", "Total taxable income (9-11)", partB.taxableIncome],
              ["13.", "Tax on total income", partB.baseTax],
              [
                "14.",
                "Rebate under section 87A, if applicable",
                partB.rebate87A,
              ],
              ["15.", "Surcharge, wherever applicable", partB.surcharge],
              ["16.", "Health and education cess @ 4%", partB.cess],
              ["17.", "Tax payable (13+15+16-14)", partB.totalTax],
              [
                "18.",
                "Less: Relief under section 89 (attach details)",
                partB.relief89,
              ],
              [
                "19.",
                "Less : Tax deducted/ collected at source as per Form No. 12BAA submitted under provisions of section 192(2B)",
                partB.taxCollected12BAA,
              ],
              ["20.", "Net tax payable (17-18-19)", partB.netTaxPayable],
            ].map(([code, label, amount]) => (
              <tr key={code}>
                <TC className="w-10">{code}</TC>
                <TC colSpan={3}>{label}</TC>
                <TC className="text-right w-32">Rs. {fmt(amount)}</TC>
              </tr>
            ))}

            {/* Verification heading */}
            <tr>
              <TC colSpan={5} className="text-center font-bold text-[13px]">
                Verification
              </TC>
            </tr>
            <tr>
              <TC colSpan={5} className="text-[11px] leading-relaxed">
                I, <span className="font-bold underline">{sig}</span>,
                son/daughter of{" "}
                <span className="inline-block min-w-[80px] border-b border-black" />{" "}
                working in the capacity of{" "}
                <span className="inline-block min-w-[80px] border-b border-black" />{" "}
                (designation) do hereby certify that the information given above
                is true, complete and correct and is based on the book of
                accounts, documents, TDS statements, and other available
                records.
              </TC>
            </tr>

            {/* Place / Date / Signature */}
            <tr>
              <TC className="font-bold">Place</TC>
              <TC colSpan={3}>{company.place}</TC>
              <TC rowSpan={2} className="align-middle text-center">
                (Signature of person responsible for deduction of tax)
              </TC>
            </tr>
            <tr>
              <TC className="font-bold">Date</TC>
              <TC colSpan={3}>{issueDate}</TC>
            </tr>
            <tr>
              <TC colSpan={2} className="font-bold">
                Designation:
              </TC>
              <TC colSpan={2} />
              <TC>
                <span className="font-bold">Full Name:</span> {sig}
              </TC>
            </tr>
          </tbody>
        </table>
      </DocPage>

      {/* ════════════════════════════════════════
          PART B — Page 3 of 3 (Tax Deducted Summary)
      ════════════════════════════════════════ */}
      <DocPage title="Form 16 Part B Page 3" footer="Page 3 of 3">
        {/* ONE TABLE: header + Tax Deducted Summary + verification — zero gaps */}
        <table className="w-full border-collapse">
          <tbody>
            {/* Name rows */}
            <tr>
              <TC className="font-bold text-center" colSpan={2}>
                Name of the Employer
              </TC>
              <TC className="font-bold text-center" colSpan={3}>
                Name of the Employee
              </TC>
            </tr>
            <tr>
              <TC className="text-center" colSpan={2}>
                {company.name}
              </TC>
              <TC className="text-center" colSpan={3}>
                {employee.nameUpper}
              </TC>
            </tr>
            {/* PAN/TAN/AY/FY rows */}
            <tr>
              <TC className="font-bold">PAN of the Deductor</TC>
              <TC className="font-bold">TAN of the Deductor</TC>
              <TC className="font-bold">PAN of the Employee</TC>
              <TC className="font-bold">Assessment Year</TC>
              <TC className="font-bold">Financial Year</TC>
            </tr>
            <tr>
              <TC>{company.deductorPan}</TC>
              <TC>{company.deductorTan}</TC>
              <TC>{employee.pan}</TC>
              <TC>{assessmentYear}</TC>
              <TC>{data.financialYear}</TC>
            </tr>

            {/* Tax Deducted Summary heading */}
            <tr>
              <TC
                colSpan={5}
                className="text-center text-[15px] font-bold py-1"
              >
                Tax Deducted Summary
              </TC>
            </tr>
            <tr>
              <TC colSpan={5} className="text-center text-[11px]">
                (Summary of Tax Payable and Tax Deducted Information)
              </TC>
            </tr>

            {/* Summary table header */}
            <tr>
              <TC className="font-bold w-14">Sl. No.</TC>
              <TC className="font-bold" colSpan={3}>
                Particulars
              </TC>
              <TC className="font-bold text-right w-32">Amount</TC>
            </tr>

            {/* Summary rows */}
            {[
              [
                "1",
                "Tax Payable as per Part-B (SN 19)",
                partB.netTaxPayable,
                false,
              ],
              [
                "2",
                "Tax Deducted at Current Employment",
                partB.currentEmploymentTDS,
                false,
              ],
              [
                "3",
                "Tax Deducted at Previous Employment",
                partB.previousEmploymentTDS,
                false,
              ],
              ["4", "Total Tax Deducted (2+3)", partB.totalTaxDeducted, false],
              [
                "5",
                "Net Tax Payable / Refundable (1-4)",
                Math.abs(partB.balancePayableOrRefundable),
                true,
              ],
            ].map(([serial, label, amount, bold]) => (
              <tr key={serial}>
                <TC>{serial}</TC>
                <TC className={bold ? "font-bold" : ""} colSpan={3}>
                  {label}
                </TC>
                <TC className={`text-right ${bold ? "font-bold" : ""}`}>
                  {fmt(amount)}
                </TC>
              </tr>
            ))}

            {/* Verification heading */}
            <tr>
              <TC colSpan={5} className="text-center font-bold text-[13px]">
                Verification
              </TC>
            </tr>
            <tr>
              <TC colSpan={5} className="text-[11px] leading-relaxed">
                I, <span className="font-bold underline">{sig}</span>,
                son/daughter of{" "}
                <span className="inline-block min-w-[80px] border-b border-black" />{" "}
                working in the capacity of{" "}
                <span className="inline-block min-w-[80px] border-b border-black" />{" "}
                (designation) do hereby certify that the information given above
                is true, complete and correct and is based on the book of
                accounts, documents, TDS statements, and other available
                records.
              </TC>
            </tr>

            {/* Place / Date / Signature */}
            <tr>
              <TC className="font-bold">Place</TC>
              <TC colSpan={3}>{company.place}</TC>
              <TC rowSpan={2} className="align-middle text-center">
                (Signature of person responsible for deduction of tax)
              </TC>
            </tr>
            <tr>
              <TC className="font-bold">Date</TC>
              <TC colSpan={3}>{issueDate}</TC>
            </tr>
            <tr>
              <TC colSpan={2} className="font-bold">
                Designation:
              </TC>
              <TC colSpan={2} />
              <TC>
                <span className="font-bold">Full Name:</span> {sig}
              </TC>
            </tr>
          </tbody>
        </table>
      </DocPage>
    </div>
  );
}
