import { describe, it, expect } from "vitest";
import { buildPayslipData } from "./payslipUtils";

describe("buildPayslipData", () => {
  it("sets salaryCredited under totals to fixed/gross salary instead of net pay", () => {
    const emp = {
      name: "Kalpesh Kamrajbhai Antiya",
      basicSalary: 11595,
      allowances: 0,
      deductions: 3527,
    };
    const payslip = {
      basicSalary: 11595,
      da: 11595,
      hra: 11110,
      conv_a: 1590,
      pt: 200,
      pf: 1800,
      esi: 21,
      tds: 1500,
      lwf: 6,
      grossSalary: 35890,
      deductions: 3527,
      netSalary: 32363,
    };

    const data = buildPayslipData({ emp, payslip, companyId: "nidhi-impex" });

    expect(data.totals.netPay).toBe(32363);
    expect(data.totals.salaryCredited).toBe(35890);
  });

  it("uses explicit fixed salary column if provided in payslip object", () => {
    const payslip = {
      salary: 40000,
      grossSalary: 35890,
      netSalary: 32363,
    };

    const data = buildPayslipData({ payslip, companyId: "nidhi-impex" });

    expect(data.totals.salaryCredited).toBe(40000);
    expect(data.totals.netPay).toBe(32363);
  });
});
