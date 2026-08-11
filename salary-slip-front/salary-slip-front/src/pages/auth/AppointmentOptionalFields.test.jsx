import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createInitialData, setAppointmentRoute } from "./testUtils/appointmentFixtures";

/**
 * Every field on the Appointment form is optional.
 *
 * The form records that somebody turned up; the rest of the detail arrives later
 * and is added through Edit. So nothing carries a required marker, nothing blocks
 * the save for being blank, and a blank field is omitted from the payload rather
 * than sent as an empty value that would overwrite something already stored.
 *
 * Format validation is deliberately untouched: blank and wrong are different
 * things, and only the second one stops a save.
 */

vi.mock("../../utils/api", () => ({
  resolveWriteCompanyId: (value) => value,
  // The lifecycle forms read companies and units from canonical master data
  // now, through useProvisioningOptions.
  provisioningLookupApi: { companyOptions: vi.fn().mockResolvedValue({ data: { companies: [], units: [] } }) },
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
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import AppointmentModal from "./AppointmentModal";
import { authApi, appointmentV1Api } from "../../utils/api";
import toast from "react-hot-toast";

const SAVE_NEW = /Save & Next: Upload Documents/i;
const SAVE_CHANGES = /Save Changes & Next: Upload Documents/i;

const renderModal = (props = {}) =>
  render(<AppointmentModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} {...props} />);

/** The appointment field values actually posted. */
const sentFields = (mock) => Object.fromEntries(mock.mock.calls[0][0].entries());

beforeEach(() => {
  vi.clearAllMocks();
  setAppointmentRoute("");
  appointmentV1Api.listDocuments.mockResolvedValue({ data: { items: [] } });
  authApi.checkEmpCodeAvailability.mockResolvedValue({ exists: false });
  authApi.submitAppointmentForm.mockResolvedValue({ status: true, data: { id: 301 } });
  authApi.updateAppointment.mockResolvedValue({ status: true, data: { id: 104 } });
});

describe("No field is marked required", () => {
  it("renders no asterisk anywhere on the form", async () => {
    renderModal();
    await screen.findByRole("button", { name: SAVE_NEW });

    // The red asterisk was rendered both by the shared field components and
    // hardcoded into the Company / Unit labels at the foot of the form.
    const asterisks = Array.from(document.querySelectorAll("span, label"))
      .filter((node) => node.textContent.trim() === "*");

    expect(asterisks).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/\*\s*:/);
  });

  it("marks no input as required to the browser or assistive tech", async () => {
    renderModal();
    await screen.findByRole("button", { name: SAVE_NEW });

    const required = Array.from(document.querySelectorAll("input[required], select[required]"));

    expect(required).toHaveLength(0);
  });
});

describe("Saving with blanks", () => {
  it("saves a completely empty form", async () => {
    renderModal();

    await userEvent.click(await screen.findByRole("button", { name: SAVE_NEW }));

    await waitFor(() => expect(authApi.submitAppointmentForm).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows no 'is required' message for any field", async () => {
    renderModal();

    await userEvent.click(await screen.findByRole("button", { name: SAVE_NEW }));

    await waitFor(() => expect(authApi.submitAppointmentForm).toHaveBeenCalled());
    expect(screen.queryByText(/is required/i)).toBeNull();
  });

  it("saves with only partial information", async () => {
    renderModal();

    await userEvent.type(await screen.findByLabelText(/Emp. Mobile No/i), "9876543210");
    await userEvent.click(screen.getByRole("button", { name: SAVE_NEW }));

    await waitFor(() => expect(authApi.submitAppointmentForm).toHaveBeenCalledTimes(1));

    const fields = sentFields(authApi.submitAppointmentForm);
    // The one thing that was filled in is saved; everything else stays blank.
    expect(fields.mobile_number).toBe("9876543210");
    expect(fields.pan_card_no ?? "").toBe("");
  });

  /**
   * A blank field must be omitted, not sent as "". The backend treats a present
   * key as an instruction to write it, so an empty value would clear whatever is
   * already stored on an edit.
   */
  it("omits blank fields from the payload rather than sending empty values", async () => {
    renderModal();

    await userEvent.click(await screen.findByRole("button", { name: SAVE_NEW }));
    await waitFor(() => expect(authApi.submitAppointmentForm).toHaveBeenCalled());

    const fields = sentFields(authApi.submitAppointmentForm);

    Object.entries(fields).forEach(([key, value]) => {
      expect(value, `${key} was sent as a literal null/undefined`).not.toBe("null");
      expect(value, `${key} was sent as a literal undefined`).not.toBe("undefined");
    });
  });

  it("still refuses a value that is present but malformed", async () => {
    renderModal();

    await userEvent.type(await screen.findByLabelText(/Emp. Mobile No/i), "12345");
    await userEvent.click(screen.getByRole("button", { name: SAVE_NEW }));

    expect(await screen.findByText(/valid 10-digit mobile number/i)).toBeInTheDocument();
    expect(authApi.submitAppointmentForm).not.toHaveBeenCalled();
  });

  it("accepts the same field left blank", async () => {
    renderModal();

    // The field that just blocked the save is fine when it is simply empty.
    await userEvent.click(await screen.findByRole("button", { name: SAVE_NEW }));

    await waitFor(() => expect(authApi.submitAppointmentForm).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/valid 10-digit mobile number/i)).toBeNull();
  });
});

describe("Editing an existing appointment", () => {
  it("saves an edit that clears an optional field", async () => {
    renderModal({ initialData: createInitialData() });

    const department = await screen.findByLabelText(/^Department/i);
    await userEvent.clear(department);
    await userEvent.click(screen.getByRole("button", { name: SAVE_CHANGES }));

    await waitFor(() => expect(authApi.updateAppointment).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("keeps the rest of the record intact", async () => {
    renderModal({ initialData: createInitialData() });
    await screen.findByRole("button", { name: SAVE_CHANGES });

    await userEvent.click(screen.getByRole("button", { name: SAVE_CHANGES }));
    await waitFor(() => expect(authApi.updateAppointment).toHaveBeenCalled());

    const fields = sentFields(authApi.updateAppointment);
    expect(fields.pan_card_no).toBe("IFTPP8308N");
  });
});
