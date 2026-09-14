import { describe, expect, it } from "vitest";
import { sumExpenseLines, sumExpensesByCategory } from "./expenseCalculations";

describe("sumExpenseLines", () => {
  it("returns 0 for an empty array", () => {
    expect(sumExpenseLines([])).toBe(0);
  });

  it("returns 0 when called with no argument at all", () => {
    expect(sumExpenseLines()).toBe(0);
  });

  it("sums a single line", () => {
    expect(sumExpenseLines([{ category: "MEDICINES", amount: "250.50" }])).toBeCloseTo(250.5);
  });

  it("sums multiple lines", () => {
    const lines = [
      { category: "CONSULTATION_FEES", amount: "500" },
      { category: "HOSPITAL_CHARGES", amount: "12000" },
      { category: "MEDICINES", amount: "375.25" },
    ];
    expect(sumExpenseLines(lines)).toBeCloseTo(12875.25);
  });

  it("treats a missing amount as 0 rather than throwing or producing NaN", () => {
    const lines = [{ category: "MEDICINES" }, { category: "OTHER_EXPENSES", amount: "100" }];
    expect(sumExpenseLines(lines)).toBe(100);
  });

  it("treats a null amount as 0", () => {
    expect(sumExpenseLines([{ category: "MEDICINES", amount: null }])).toBe(0);
  });

  it("treats an empty-string amount (untouched input row) as 0", () => {
    expect(sumExpenseLines([{ category: "MEDICINES", amount: "" }])).toBe(0);
  });

  it("ignores a non-numeric amount rather than producing NaN", () => {
    expect(sumExpenseLines([{ category: "MEDICINES", amount: "not-a-number" }])).toBe(0);
  });

  it("ignores negative amounts (never subtracts from the running total)", () => {
    const lines = [{ category: "MEDICINES", amount: "-50" }, { category: "OTHER_EXPENSES", amount: "100" }];
    expect(sumExpenseLines(lines)).toBe(100);
  });

  it("is defensive against a non-array input", () => {
    expect(sumExpenseLines(null)).toBe(0);
    expect(sumExpenseLines(undefined)).toBe(0);
    expect(sumExpenseLines("not an array")).toBe(0);
  });

  it("is defensive against a null line entry inside the array", () => {
    expect(sumExpenseLines([null, { category: "MEDICINES", amount: "100" }])).toBe(100);
  });
});

describe("sumExpensesByCategory", () => {
  it("returns an empty object for an empty array", () => {
    expect(sumExpensesByCategory([])).toEqual({});
  });

  it("groups amounts by category", () => {
    const lines = [
      { category: "MEDICINES", amount: "100" },
      { category: "MEDICINES", amount: "50" },
      { category: "HOSPITAL_CHARGES", amount: "2000" },
    ];
    expect(sumExpensesByCategory(lines)).toEqual({ MEDICINES: 150, HOSPITAL_CHARGES: 2000 });
  });

  it("skips a line with no category", () => {
    expect(sumExpensesByCategory([{ amount: "100" }])).toEqual({});
  });
});
