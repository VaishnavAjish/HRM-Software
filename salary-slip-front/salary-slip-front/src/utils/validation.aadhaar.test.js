import { describe, it, expect } from "vitest";
import { validateAadhaar, validateEmployeeForm } from "./validation";

/**
 * validateAadhaar sits in front of every employee save.
 *
 * Once edit forms began prefilling the stored number, the value reaching this
 * function was grouped for readability — so a strict /^\d{12}$/ rejected an
 * untouched field and made it impossible to save any employee at all. The rule
 * validates digits, not presentation.
 */
describe("validateAadhaar", () => {
  it("accepts a grouped twelve-digit number", () => {
    expect(validateAadhaar("1234 5678 9012")).toBe(true);
    expect(validateAadhaar("1234-5678-9012")).toBe(true);
  });

  it("accepts twelve bare digits", () => {
    expect(validateAadhaar("123456789012")).toBe(true);
  });

  it("treats an absent value as valid", () => {
    expect(validateAadhaar("")).toBe(true);
    expect(validateAadhaar(undefined)).toBe(true);
    // What a record with no number renders as.
    expect(validateAadhaar("-")).toBe(true);
  });

  it("still rejects a wrong number of digits", () => {
    expect(validateAadhaar("1234 5678 901")).toBe(false);
    expect(validateAadhaar("1234567890123")).toBe(false);
  });
});

describe("validateEmployeeForm", () => {
  const form = {
    empCode: "EMP1",
    name: "Ravi",
    email: "ravi@example.com",
    mobileNo: "9876543210",
  };

  it("does not block a save because the Aadhaar field is grouped", () => {
    const errors = validateEmployeeForm({ ...form, aadharCardNo: "1234 5678 9012" });

    expect(errors.filter((e) => /Aadhaar/i.test(e))).toEqual([]);
  });

  it("does not block a save for an employee with no Aadhaar on file", () => {
    const errors = validateEmployeeForm({ ...form, aadharCardNo: "-" });

    expect(errors.filter((e) => /Aadhaar/i.test(e))).toEqual([]);
  });

  it("still reports a partial Aadhaar", () => {
    const errors = validateEmployeeForm({ ...form, aadharCardNo: "1234 5678" });

    expect(errors.some((e) => /Aadhaar must be exactly 12 digits/i.test(e))).toBe(true);
  });
});
