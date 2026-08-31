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

  it("correctly includes W.A. in Nidhi Impex salary slip calculation and earning rows", () => {
    const payslip = {
      basic: 10000,
      da: 5000,
      hra: 3000,
      wa: 2000,
      conv_a: 1000,
      pt: 200,
      pf: 1200,
    };

    const data = buildPayslipData({ payslip, companyId: "nidhi-impex" });

    expect(data.components.wa).toBe(2000);
    expect(data.totals.earnings).toBe(21000);
    expect(data.totals.deductions).toBe(1400);
    expect(data.totals.netPay).toBe(19600);

    const waRow = data.earningRows.find((r) => r.label === "W.A");
    expect(waRow).toBeDefined();
    expect(waRow.amount).toBe(2000);
  });

  it("correctly includes PERFO and OTHER in Silver Star salary slip calculation and components", () => {
    const payslip = {
      basic: 15000,
      da: 5000,
      hra: 3000,
      wa: 1000,
      conv_a: 1000,
      comm: 4500, // Perfo stored as comm in DB
      other: 2500, // Others stored as other in DB
      pt: 200,
      pf: 1800,
    };

    const data = buildPayslipData({ payslip, companyId: "silver-star" });

    expect(data.components.perfo).toBe(4500);
    expect(data.components.comm).toBe(4500);
    expect(data.components.other).toBe(2500);
    expect(data.components.others).toBe(2500);
    expect(data.totals.earnings).toBe(32000); // 15k+5k+3k+1k+1k+4.5k+2.5k
    expect(data.totals.deductions).toBe(2000);
    expect(data.totals.netPay).toBe(30000);

    const perfoRow = data.earningRows.find((r) => r.label === "PERFO");
    expect(perfoRow).toBeDefined();
    expect(perfoRow.amount).toBe(4500);

    const otherRow = data.earningRows.find((r) => r.label === "OTHER");
    expect(otherRow).toBeDefined();
    expect(otherRow.amount).toBe(2500);
  });
});
