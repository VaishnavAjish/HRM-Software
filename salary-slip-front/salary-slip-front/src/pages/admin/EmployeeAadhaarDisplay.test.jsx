import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Complete Aadhaar display on the employee surface.
 *
 * The employee details modal, the grid column, the edit form and the spreadsheet
 * export all read the same mapped field, so these tests cover the mapping rule
 * and the one component that renders it. The rule itself lives in
 * getAadhaarDisplayValue, which every screen goes through — that is what keeps
 * the employee pages from drifting away from the appointment pages again.
 */

const FULL_DIGITS = "123456789012";
const FULL_FORMATTED = "1234 5678 9012";
const MASKED = "XXXX XXXX 9012";

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, createPortal: (node) => node };
});

vi.mock("../../../components/documents/EmployeeDocuments", () => ({
  default: () => <div />,
}));
vi.mock("../../components/documents/EmployeeDocuments", () => ({
  default: () => <div />,
}));
vi.mock("../../components/ModernDatePicker", () => ({ default: () => <input /> }));
vi.mock("../../../components/ModernDatePicker", () => ({ default: () => <input /> }));

import EmployeeDetailsModal from "./AdminModals/EmployeeDetailsModal";
import { getAadhaarDisplayValue, hasStoredAadhaar } from "../../utils/aadhaar";

/** What the employee list/details endpoints return for an authorised request. */
const apiRow = {
  id: 42,
  name: "Ravi Kumar",
  emp_code: "EMP1099",
  email: "ravi@example.com",
  company_code: "nidhi-impex",
  unit: "Ichapur",
  status: "0",
  aadhaar_full: FULL_DIGITS,
  aadhaar_masked: MASKED,
  has_aadhaar: true,
  pan_card_no: "ABCDE1234E",
};

/** The subset of mapEmployee's output these screens read. */
function mapped(row) {
  return {
    id: row.id,
    displayName: row.name,
    empCode: String(row.emp_code ?? ""),
    aadharCardNo: getAadhaarDisplayValue(row),
    aadhaarOnFile: getAadhaarDisplayValue(row),
    hasAadhaar: hasStoredAadhaar(row),
    panCardNo: row.pan_card_no ?? "",
  };
}

describe("Employee row mapping", () => {
  it("maps the complete number, grouped in fours", () => {
    expect(mapped(apiRow).aadharCardNo).toBe(FULL_FORMATTED);
  });

  it("never yields a mask when a full number is present", () => {
    expect(mapped(apiRow).aadharCardNo).not.toContain("XXXX");
  });

  it("yields a dash rather than a mask when the server sent no full number", () => {
    const row = { ...apiRow, aadhaar_full: undefined };

    expect(mapped(row).aadharCardNo).toBe("-");
    expect(mapped(row).aadharCardNo).not.toBe(MASKED);
  });

  it("still knows a number is on file so a cleared edit field means 'keep it'", () => {
    expect(mapped(apiRow).hasAadhaar).toBe(true);
    expect(mapped({ ...apiRow, aadhaar_full: undefined, has_aadhaar: true }).hasAadhaar).toBe(true);
  });

  /**
   * The prompt is explicit that exports must stay text. The grouping does that
   * for free — a spreadsheet cannot parse "1234 5678 9012" as a number, so no
   * leading zero is dropped and no value is rendered in scientific notation.
   */
  it("stays a string that a spreadsheet cannot coerce to a number", () => {
    const value = mapped(apiRow).aadharCardNo;

    expect(typeof value).toBe("string");
    expect(Number.isNaN(Number(value))).toBe(true);
    expect(value).toMatch(/^\d{4} \d{4} \d{4}$/);
  });

  it("keeps a leading zero that Number() would destroy", () => {
    const value = getAadhaarDisplayValue({ aadhaar_full: "012345678901" });

    expect(value).toBe("0123 4567 8901");
    expect(value.startsWith("0")).toBe(true);
  });
});

describe("Employee details modal", () => {
  const renderModal = (row = apiRow) =>
    render(
      <EmployeeDetailsModal
        isOpen
        onClose={vi.fn()}
        selected={mapped(row)}
        viewLoading={false}
        openEdit={vi.fn()}
      />,
    );

  it("shows the complete number under Government IDs", async () => {
    renderModal();

    // The modal renders a desktop and a mobile tab strip, so both match.
    const [tab] = screen.getAllByRole("button", { name: /Financials & Identity/i });
    await userEvent.click(tab);

    expect(screen.getByText("Aadhaar Card No")).toBeInTheDocument();
    expect(screen.getByDisplayValue(FULL_FORMATTED)).toBeInTheDocument();
  });

  it("shows no mask and no Show or Hide control", async () => {
    renderModal();

    // The modal renders a desktop and a mobile tab strip, so both match.
    const [tab] = screen.getAllByRole("button", { name: /Financials & Identity/i });
    await userEvent.click(tab);

    expect(screen.queryByText(MASKED)).toBeNull();
    expect(screen.queryByDisplayValue(MASKED)).toBeNull();
    expect(screen.queryByRole("button", { name: /^show$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^hide$/i })).toBeNull();
  });

  it("uses the corrected label spelling", async () => {
    renderModal();

    // The modal renders a desktop and a mobile tab strip, so both match.
    const [tab] = screen.getAllByRole("button", { name: /Financials & Identity/i });
    await userEvent.click(tab);

    expect(screen.getByText("Aadhaar Card No")).toBeInTheDocument();
    expect(screen.queryByText("Aadhar Card No")).toBeNull();
  });
});
