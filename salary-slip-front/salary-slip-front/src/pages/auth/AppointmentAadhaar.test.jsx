import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  createInitialData,
  setAppointmentRoute,
} from "./testUtils/appointmentFixtures";

vi.mock("../../utils/api", () => ({
  // AppointmentModal and TrialFormModal import this helper from utils/api to
  // resolve the company a write belongs to. A vi.mock factory replaces the whole
  // module, so omitting it makes the import undefined and the save throws before
  // it reaches the API — which reads as "nothing was submitted".
  resolveWriteCompanyId: (value) => value,
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
    getTypes: vi.fn(() => Promise.resolve({ data: { types: [] } })),
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
const AADHAAR_LABEL = /Aadhaar Card No/i;

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
  it("prefills the input with the complete stored number", async () => {
    renderModal({ initialData: createInitialData() });

    const input = await screen.findByLabelText(AADHAAR_LABEL);
    // The API now discloses the number to a request allowed to reach the record,
    // so an editor can check it against the document without retyping it.
    expect(input).toHaveValue("7151 1598 8793");
    // Nothing masked is shown anywhere on the form.
    expect(screen.queryByText("XXXX XXXX 8793")).toBeNull();
    // Locked once the record exists, so the stored number cannot be edited away.
    expect(input).toBeDisabled();
    expect(screen.getByText(/locked once saved/i)).toBeInTheDocument();
  });

  it("cannot be edited away once the record exists", async () => {
    renderModal({ initialData: createInitialData() });

    const input = await screen.findByLabelText(AADHAAR_LABEL);

    // The stored number drives the record's S3 document folder, so it is locked
    // rather than merely discouraged — clearing it would detach the record from
    // its own documents.
    expect(input).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: SAVE }));
    await waitFor(() => expect(authApi.updateAppointment).toHaveBeenCalledTimes(1));

    expect(sentFields(authApi.updateAppointment).aadhar_card_no).toBe("715115988793");
  });

  it("saves the untouched prefilled number back as digits", async () => {
    renderModal({ initialData: createInitialData() });
    await screen.findByRole("button", { name: SAVE });

    await userEvent.click(screen.getByRole("button", { name: SAVE }));

    await waitFor(() => expect(authApi.updateAppointment).toHaveBeenCalledTimes(1));

    const fields = sentFields(authApi.updateAppointment);

    // Posting it back is a no-op because it is the real stored value, not a mask.
    // Digits only, so the grouping shown in the input never reaches the column.
    expect(fields.aadhar_card_no).toBe("715115988793");
    expect(fields.pan_card_no).toBe("IFTPP8308N");
  });

  it("never posts the masked display string back", async () => {
    renderModal({ initialData: createInitialData() });
    await screen.findByRole("button", { name: SAVE });

    await userEvent.click(screen.getByRole("button", { name: SAVE }));
    await waitFor(() => expect(authApi.updateAppointment).toHaveBeenCalled());

    const posted = JSON.stringify(sentFields(authApi.updateAppointment));
    expect(posted).not.toContain("XXXX");
  });

  it("carries the complete number into the documents step summary", async () => {
    renderModal({ initialData: createInitialData() });
    await screen.findByRole("button", { name: SAVE });

    await userEvent.click(screen.getByRole("button", { name: SAVE }));

    expect(await screen.findByRole("button", { name: /Complete Appointment/i })).toBeInTheDocument();
    expect(screen.getByText("7151 1598 8793")).toBeInTheDocument();
    expect(screen.queryByText("XXXX XXXX 8793")).toBeNull();
  });

  it("carries the locked number through to the documents step", async () => {
    renderModal({ initialData: createInitialData() });

    await userEvent.click(await screen.findByRole("button", { name: SAVE }));

    expect(await screen.findByRole("button", { name: /Complete Appointment/i })).toBeInTheDocument();
    expect(screen.getByText("7151 1598 8793")).toBeInTheDocument();
  });
});

describe("AppointmentModal — Aadhaar on a new record", () => {
  /** A trial prefill builds a brand-new appointment row. */
  const trialPrefill = () => ({
    initialData: createInitialData(),
    isPrefillFromTrial: true,
  });

  it("saves without an Aadhaar at all", async () => {
    renderModal(trialPrefill());
    await screen.findByRole("button", { name: SAVE_NEW });

    // Every field on this form is optional. A trial prefill carries the number
    // across, but clearing it must not block the save.
    await userEvent.clear(await screen.findByLabelText(AADHAAR_LABEL));
    await userEvent.click(screen.getByRole("button", { name: SAVE_NEW }));

    await waitFor(() => expect(authApi.submitAppointmentForm).toHaveBeenCalledTimes(1));

    // Omitted rather than sent empty — an empty value would clear a stored one.
    expect("aadhar_card_no" in sentFields(authApi.submitAppointmentForm)).toBe(false);
    expect(screen.queryByText(/is required/i)).toBeNull();
  });

  it("rejects a partial number instead of storing it", async () => {
    renderModal(trialPrefill());

    // Blank is fine; half a number is not — the distinction format validation
    // still draws now that nothing is mandatory.
    const input = await screen.findByLabelText(AADHAAR_LABEL);
    await userEvent.clear(input);
    await userEvent.type(input, "12345");
    await userEvent.click(screen.getByRole("button", { name: SAVE_NEW }));

    expect(await screen.findByText(/Must be 12 digits/i)).toBeInTheDocument();
    expect(authApi.submitAppointmentForm).not.toHaveBeenCalled();
  });

  it("includes the number in the create payload as digits", async () => {
    renderModal(trialPrefill());

    const field = await screen.findByLabelText(AADHAAR_LABEL);
    await userEvent.clear(field);
    await userEvent.type(field, "715115988793");
    await userEvent.click(screen.getByRole("button", { name: SAVE_NEW }));

    await waitFor(() => expect(authApi.submitAppointmentForm).toHaveBeenCalledTimes(1));

    const fields = sentFields(authApi.submitAppointmentForm);
    expect(fields.aadhar_card_no).toBe("715115988793");
    // Still a string — a numeric conversion would corrupt leading zeros.
    expect(typeof fields.aadhar_card_no).toBe("string");
  });

  it("keeps Aadhaar in the payload even though documents upload separately", async () => {
    renderModal(trialPrefill());

    const entered = await screen.findByLabelText(AADHAAR_LABEL);
    await userEvent.clear(entered);
    await userEvent.type(entered, "715115988793");
    await userEvent.click(screen.getByRole("button", { name: SAVE_NEW }));

    await waitFor(() => expect(authApi.submitAppointmentForm).toHaveBeenCalled());

    const fields = sentFields(authApi.submitAppointmentForm);
    expect(fields.aadhar_card_no).toBe("715115988793");
    // The save-first split removed document binaries, not identity fields.
    expect("adhar_image" in fields).toBe(false);
    expect("photo" in fields).toBe(false);
  });
});
