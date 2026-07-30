import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  createInitialData,
  setAppointmentRoute,
} from "./testUtils/appointmentFixtures";

vi.mock("../../utils/api", () => ({
  authApi: {
    submitAppointmentForm: vi.fn(),
    updateAppointment: vi.fn(),
    checkEmpCodeAvailability: vi.fn(),
  },
  salaryApi: { getDepartments: vi.fn() },
  appointmentV1Api: {
    get: vi.fn(),
    uploadDocument: vi.fn(),
    listDocuments: vi.fn(),
    complete: vi.fn(),
  },
  documentV1Api: {
    replace: vi.fn(),
    remove: vi.fn(),
    downloadUrl: vi.fn(),
    viewUrl: vi.fn(),
  },
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: { accessToken: "t", tokenType: "Bearer", role: "admin" } }),
}));
vi.mock("../../context/CompanyContext", () => ({
  useCompany: () => ({ isAllCompanies: false, companyId: "nidhi-impex" }),
}));
vi.mock("../../hooks/useIsMobile", () => ({ default: () => false }));
vi.mock("../../hooks/usePhotoCapture", () => ({
  default: () => ({ requestCapture: vi.fn(), cameraModal: null }),
}));
vi.mock("../../components/ModernDatePicker", () => ({
  default: ({ value, onChange, ...rest }) => (
    <input type="date" value={value || ""} onChange={(e) => onChange?.(e.target.value)} {...rest} />
  ),
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import AppointmentModal from "./AppointmentModal";
import { authApi, appointmentV1Api } from "../../utils/api";
import { maskAadhaar, normaliseAadhaar, isCompleteAadhaar } from "../../utils/aadhaar";

const SAVE = /Save Changes & Next: Upload Documents/i;
const SAVE_NEW = /Save & Next: Upload Documents/i;
const AADHAAR_LABEL = /Aadhar Card No/i;

const renderModal = (props = {}) =>
  render(<AppointmentModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} {...props} />);

/** The appointment field values actually posted. */
const sentFields = (mock) => {
  const payload = mock.mock.calls[0][0];
  return Object.fromEntries(payload.entries());
};

beforeEach(() => {
  vi.clearAllMocks();
  setAppointmentRoute("");
  appointmentV1Api.listDocuments.mockResolvedValue({ data: { items: [] } });
  appointmentV1Api.uploadDocument.mockResolvedValue({ data: { documentId: 1 } });
  authApi.checkEmpCodeAvailability.mockResolvedValue({ exists: false });
  authApi.updateAppointment.mockResolvedValue({ user: { id: 104 } });
  authApi.submitAppointmentForm.mockResolvedValue({ data: { id: 301 } });
});

afterEach(() => setAppointmentRoute(""));

describe("aadhaar helpers", () => {
  it("keeps the value a string and strips formatting", () => {
    expect(normaliseAadhaar("1234 5678 9012")).toBe("123456789012");
    expect(normaliseAadhaar("1234-5678-9012")).toBe("123456789012");
    // Leading zeros must survive — Number() would destroy this.
    expect(normaliseAadhaar("0123 4567 8901")).toBe("012345678901");
    expect(normaliseAadhaar(null)).toBe("");
  });

  it("masks only a complete number", () => {
    expect(maskAadhaar("123456789012")).toBe("XXXX XXXX 9012");
    expect(maskAadhaar("1234 5678 9012")).toBe("XXXX XXXX 9012");
    // Partial input must never render as though it were on file.
    expect(maskAadhaar("9012")).toBe("");
    expect(maskAadhaar("")).toBe("");
    expect(isCompleteAadhaar("12345678901")).toBe(false);
    expect(isCompleteAadhaar("123456789012")).toBe(true);
  });

  it("never returns the full number from the masker", () => {
    expect(maskAadhaar("123456789012")).not.toContain("12345678");
  });
});

describe("AppointmentModal — Aadhaar on an existing record", () => {
  it("leaves the input empty and says the number is on file", async () => {
    renderModal({ initialData: createInitialData() });

    const input = await screen.findByLabelText(AADHAAR_LABEL);
    // The API never sends the raw number, so prefilling is impossible; the mask
    // must not be dropped into the input either.
    expect(input).toHaveValue("");
    expect(screen.getByText(/On file:/i)).toBeInTheDocument();
    expect(screen.getByText("XXXX XXXX 8793")).toBeInTheDocument();
  });

  it("saves without re-entering it and omits the field entirely", async () => {
    renderModal({ initialData: createInitialData() });
    await screen.findByRole("button", { name: SAVE });

    await userEvent.click(screen.getByRole("button", { name: SAVE }));

    await waitFor(() => expect(authApi.updateAppointment).toHaveBeenCalledTimes(1));

    // Absent, not empty: an empty value would overwrite the stored number.
    const fields = sentFields(authApi.updateAppointment);
    expect("aadhar_card_no" in fields).toBe(false);
    expect(fields.pan_card_no).toBe("IFTPP8308N");
  });

  it("sends a replacement only when all 12 digits are entered", async () => {
    renderModal({ initialData: createInitialData() });

    const input = await screen.findByLabelText(AADHAAR_LABEL);
    await userEvent.type(input, "999988887777");
    await userEvent.click(screen.getByRole("button", { name: SAVE }));

    await waitFor(() => expect(authApi.updateAppointment).toHaveBeenCalledTimes(1));
    expect(sentFields(authApi.updateAppointment).aadhar_card_no).toBe("999988887777");
  });

  it("blocks the save on a partial entry rather than storing a truncated number", async () => {
    renderModal({ initialData: createInitialData() });

    // Four digits are exactly what a mask's tail looks like — the shape that
    // would arrive if a UI ever posted "XXXX XXXX 9012" back.
    await userEvent.type(await screen.findByLabelText(AADHAAR_LABEL), "9999");
    await userEvent.click(screen.getByRole("button", { name: SAVE }));

    expect(await screen.findByText(/Must be 12 digits/i)).toBeInTheDocument();
    // Nothing is written at all, so the stored number cannot be damaged.
    expect(authApi.updateAppointment).not.toHaveBeenCalled();
  });

  it("never posts the masked display string back", async () => {
    renderModal({ initialData: createInitialData() });
    await screen.findByRole("button", { name: SAVE });

    await userEvent.click(screen.getByRole("button", { name: SAVE }));
    await waitFor(() => expect(authApi.updateAppointment).toHaveBeenCalled());

    const posted = JSON.stringify(sentFields(authApi.updateAppointment));
    expect(posted).not.toContain("XXXX");
  });

  it("carries the mask into the documents step summary", async () => {
    renderModal({ initialData: createInitialData() });
    await screen.findByRole("button", { name: SAVE });

    await userEvent.click(screen.getByRole("button", { name: SAVE }));

    expect(await screen.findByRole("button", { name: /Complete Appointment/i })).toBeInTheDocument();
    expect(screen.getByText("XXXX XXXX 8793")).toBeInTheDocument();
  });

  it("shows the new mask after the number is replaced", async () => {
    renderModal({ initialData: createInitialData() });

    await userEvent.type(await screen.findByLabelText(AADHAAR_LABEL), "999988887777");
    await userEvent.click(screen.getByRole("button", { name: SAVE }));

    expect(await screen.findByRole("button", { name: /Complete Appointment/i })).toBeInTheDocument();
    expect(screen.getByText("XXXX XXXX 7777")).toBeInTheDocument();
  });
});

describe("AppointmentModal — Aadhaar on a new record", () => {
  /** A trial prefill builds a brand-new appointment row. */
  const trialPrefill = () => ({
    initialData: createInitialData(),
    isPrefillFromTrial: true,
  });

  it("requires the number because nothing is on file yet", async () => {
    renderModal(trialPrefill());
    await screen.findByRole("button", { name: SAVE_NEW });

    expect(screen.queryByText(/On file:/i)).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: SAVE_NEW }));

    expect(await screen.findByText(/Aadhar Card No is required/i)).toBeInTheDocument();
    expect(authApi.submitAppointmentForm).not.toHaveBeenCalled();
  });

  it("rejects a partial number instead of storing it", async () => {
    renderModal(trialPrefill());

    await userEvent.type(await screen.findByLabelText(AADHAAR_LABEL), "12345");
    await userEvent.click(screen.getByRole("button", { name: SAVE_NEW }));

    expect(await screen.findByText(/Must be 12 digits/i)).toBeInTheDocument();
    expect(authApi.submitAppointmentForm).not.toHaveBeenCalled();
  });

  it("includes the number in the create payload as digits", async () => {
    renderModal(trialPrefill());

    await userEvent.type(await screen.findByLabelText(AADHAAR_LABEL), "715115988793");
    await userEvent.click(screen.getByRole("button", { name: SAVE_NEW }));

    await waitFor(() => expect(authApi.submitAppointmentForm).toHaveBeenCalledTimes(1));

    const fields = sentFields(authApi.submitAppointmentForm);
    expect(fields.aadhar_card_no).toBe("715115988793");
    // Still a string — a numeric conversion would corrupt leading zeros.
    expect(typeof fields.aadhar_card_no).toBe("string");
  });

  it("keeps Aadhaar in the payload even though documents upload separately", async () => {
    renderModal(trialPrefill());

    await userEvent.type(await screen.findByLabelText(AADHAAR_LABEL), "715115988793");
    await userEvent.click(screen.getByRole("button", { name: SAVE_NEW }));

    await waitFor(() => expect(authApi.submitAppointmentForm).toHaveBeenCalled());

    const fields = sentFields(authApi.submitAppointmentForm);
    expect(fields.aadhar_card_no).toBe("715115988793");
    // The save-first split removed document binaries, not identity fields.
    expect("adhar_image" in fields).toBe(false);
    expect("photo" in fields).toBe(false);
  });
});
