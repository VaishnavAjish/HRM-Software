import { describe, it, expect } from "vitest";

import {
  aadhaarDisplayFor,
  buildSafeAadhaarUpdate,
  formatFullAadhaar,
  hasStoredAadhaar,
  isCompleteAadhaar,
  maskAadhaar,
  normaliseAadhaar,
} from "./aadhaar";

describe("formatFullAadhaar", () => {
  it("groups twelve digits into fours", () => {
    expect(formatFullAadhaar("715115988793")).toBe("7151 1598 8793");
    expect(formatFullAadhaar("7151 1598 8793")).toBe("7151 1598 8793");
    expect(formatFullAadhaar("7151-1598-8793")).toBe("7151 1598 8793");
  });

  it("preserves leading zeros", () => {
    expect(formatFullAadhaar("012345678901")).toBe("0123 4567 8901");
  });

  it("refuses anything that is not a complete number", () => {
    // A mask normalises to four digits and must never format as an Aadhaar.
    expect(formatFullAadhaar("XXXX XXXX 8793")).toBe("-");
    expect(formatFullAadhaar("12345")).toBe("-");
    expect(formatFullAadhaar("")).toBe("-");
    expect(formatFullAadhaar(null)).toBe("-");
  });
});

describe("aadhaarDisplayFor", () => {
  it("prefers the full number when the server supplied one", () => {
    expect(
      aadhaarDisplayFor({ aadhaar_full: "715115988793", aadhaar_masked: "XXXX XXXX 8793" }),
    ).toBe("7151 1598 8793");
  });

  it("shows a dash rather than a mask when no full number was supplied", () => {
    // The mask fallback is gone deliberately. A payload without aadhaar_full is a
    // missing field, and rendering "XXXX XXXX 8793" made that look like a
    // permission decision instead — which is how the app ended up masked on one
    // screen and complete on another.
    expect(aadhaarDisplayFor({ aadhaar_masked: "XXXX XXXX 8793" })).toBe("-");
  });

  it("reads the number from whichever legacy key carries it", () => {
    expect(aadhaarDisplayFor({ aadhar_card_no: "715115988793" })).toBe("7151 1598 8793");
    expect(aadhaarDisplayFor({ aadharNo: "715115988793" })).toBe("7151 1598 8793");
  });

  it("never reconstructs a full number from a mask", () => {
    expect(aadhaarDisplayFor({ aadhaar_masked: "XXXX XXXX 8793" })).not.toMatch(/^\d{4} /);
  });

  it("shows a dash when there is nothing at all", () => {
    expect(aadhaarDisplayFor({})).toBe("-");
    expect(aadhaarDisplayFor(null)).toBe("-");
  });
});

/**
 * The rules these encode exist because `aadhar_card_no` is hidden from every API
 * response. An edit form therefore starts blank even when a number is stored, so
 * "blank" has to mean "unchanged" — sending "" or null is what erased stored
 * Aadhaars and detached records from their S3 document folders.
 */

describe("hasStoredAadhaar", () => {
  it("trusts the explicit flag from the API", () => {
    expect(hasStoredAadhaar({ has_aadhaar: true })).toBe(true);
    expect(hasStoredAadhaar({ has_aadhaar: false })).toBe(false);
  });

  it("prefers the flag over a mask that disagrees", () => {
    // A malformed legacy value masks to "", which would otherwise read as
    // "nothing stored" and make the form demand a number it already has.
    expect(hasStoredAadhaar({ has_aadhaar: true, aadhaar_masked: "" })).toBe(true);
  });

  it("falls back to the mask for an older response shape", () => {
    expect(hasStoredAadhaar({ aadhaar_masked: "XXXX XXXX 9012" })).toBe(true);
    expect(hasStoredAadhaar({ aadhaar_masked: "" })).toBe(false);
    expect(hasStoredAadhaar(null)).toBe(false);
  });
});

describe("buildSafeAadhaarUpdate — editing a record that has one on file", () => {
  const editing = (enteredValue) =>
    buildSafeAadhaarUpdate({ enteredValue, hasStored: true, isCreateMode: false });

  it("omits the field when nothing was typed", () => {
    const result = editing("");

    // include:false is the whole point — the key must be absent, not empty.
    expect(result.include).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result).not.toHaveProperty("value");
  });

  it("treats whitespace as nothing typed", () => {
    expect(editing("   ").include).toBe(false);
  });

  it("refuses a pasted mask instead of storing its last four digits", () => {
    const result = editing("XXXX XXXX 9012");

    expect(result.include).toBe(false);
    expect(result.error).toMatch(/complete 12-digit/i);
  });

  it("refuses a partial number", () => {
    expect(editing("12345").error).toMatch(/complete 12-digit/i);
    expect(editing("12345").include).toBe(false);
  });

  it("accepts a complete replacement and normalises it", () => {
    expect(editing("9999 8888 7777")).toEqual({ include: true, value: "999988887777" });
    expect(editing("9999-8888-7777")).toEqual({ include: true, value: "999988887777" });
    expect(editing("999988887777")).toEqual({ include: true, value: "999988887777" });
  });

  it("keeps leading zeros, which a numeric conversion would destroy", () => {
    expect(editing("012345678901")).toEqual({ include: true, value: "012345678901" });
  });
});

describe("buildSafeAadhaarUpdate — editing a record with nothing on file", () => {
  const editing = (enteredValue, required = false) =>
    buildSafeAadhaarUpdate({ enteredValue, hasStored: false, isCreateMode: false, required });

  it("still omits the field when nothing was typed", () => {
    expect(editing("").include).toBe(false);
  });

  it("reports the requirement when the field is mandatory", () => {
    expect(editing("", true).error).toMatch(/complete 12-digit/i);
  });

  it("accepts a first-time entry", () => {
    expect(editing("123456789012")).toEqual({ include: true, value: "123456789012" });
  });
});

describe("buildSafeAadhaarUpdate — creating a record", () => {
  const creating = (enteredValue, required = false) =>
    buildSafeAadhaarUpdate({ enteredValue, isCreateMode: true, required });

  it("omits an empty optional value rather than sending null", () => {
    const result = creating("");

    expect(result.include).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it("blocks an empty value when the number is required", () => {
    expect(creating("", true).error).toMatch(/complete 12-digit/i);
  });

  it("never accepts a masked value as a new record's number", () => {
    // A new record must not inherit a mask from a trial or appointment row.
    expect(creating("XXXX XXXX 9012").include).toBe(false);
    expect(creating("XXXX XXXX 9012").error).toBeTruthy();
  });

  it("normalises a complete entry", () => {
    expect(creating("1234 5678 9012")).toEqual({ include: true, value: "123456789012" });
  });
});

describe("masking helpers", () => {
  it("only masks a complete number", () => {
    expect(maskAadhaar("123456789012")).toBe("XXXX XXXX 9012");
    expect(maskAadhaar("9012")).toBe("");
    expect(isCompleteAadhaar("123456789012")).toBe(true);
    expect(isCompleteAadhaar("1234567890123")).toBe(false);
  });

  it("never leaks more than the last four digits", () => {
    const masked = maskAadhaar("123456789012");

    expect(masked).not.toContain("12345678");
    expect(masked.replace(/\D/g, "")).toBe("9012");
  });

  it("normalises without changing the digits", () => {
    expect(normaliseAadhaar("1234 5678 9012")).toBe("123456789012");
    expect(normaliseAadhaar(undefined)).toBe("");
  });
});

/**
 * The spread used at both employee payload sites. Written out here because the
 * bug was in exactly this shape: `aadhar_card_no: form.aadharCardNo || null`
 * always produced a key, and the key was always null.
 */
describe("payload assembly", () => {
  const payloadFor = (result) => ({
    name: "Rohit",
    ...(result.include && { aadhar_card_no: result.value }),
  });

  it("leaves the key out entirely when editing with a blank input", () => {
    const payload = payloadFor(
      buildSafeAadhaarUpdate({ enteredValue: "", hasStored: true, isCreateMode: false }),
    );

    expect("aadhar_card_no" in payload).toBe(false);
    expect(payload).toEqual({ name: "Rohit" });
  });

  it("includes the normalised digits when replacing", () => {
    const payload = payloadFor(
      buildSafeAadhaarUpdate({
        enteredValue: "9999 8888 7777",
        hasStored: true,
        isCreateMode: false,
      }),
    );

    expect(payload.aadhar_card_no).toBe("999988887777");
  });
});

/**
 * Regressions found by reading the edit paths after the full-display change.
 *
 * Both were introduced by prefilling edit inputs with the stored number: the
 * value now arrives grouped ("1234 5678 9012") and, for a record with nothing on
 * file, arrives as the display dash. Neither shape existed while the inputs
 * started empty, and both blocked saves that had nothing to do with Aadhaar.
 */
describe("prefilled edit inputs", () => {
  it("accepts the grouped prefill as an unchanged value", () => {
    const result = buildSafeAadhaarUpdate({
      enteredValue: "1234 5678 9012",
      hasStored: true,
      isCreateMode: false,
    });

    expect(result.error).toBeUndefined();
    expect(result.include).toBe(true);
    expect(result.value).toBe("123456789012");
  });

  it("treats the display dash as nothing entered rather than a bad entry", () => {
    // getAadhaarDisplayValue renders "-" for a record with no number, and that
    // string lands in the prefilled input. Rejecting it blocked the save of every
    // employee who had no Aadhaar on file.
    const result = buildSafeAadhaarUpdate({
      enteredValue: "-",
      hasStored: false,
      isCreateMode: false,
    });

    expect(result.error).toBeUndefined();
    expect(result.include).toBe(false);
  });

  it("still refuses a genuinely partial entry", () => {
    const result = buildSafeAadhaarUpdate({
      enteredValue: "1234 56",
      hasStored: true,
      isCreateMode: false,
    });

    expect(result.include).toBe(false);
    expect(result.error).toMatch(/12-digit/);
  });
});
