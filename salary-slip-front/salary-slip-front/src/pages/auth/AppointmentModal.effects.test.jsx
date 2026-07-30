import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createInitialData, createPhotoFile, setAppointmentRoute } from "./testUtils/appointmentFixtures";

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

// Deliberately returns a NEW object on every call, the way a context hook
// reading an unmemoised provider value does. Nothing in the modal may depend on
// that identity staying stable.
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: { accessToken: "t", tokenType: "Bearer", role: "admin" } }),
}));
vi.mock("../../context/CompanyContext", () => ({
  useCompany: () => ({ isAllCompanies: false, companyId: "nidhi-impex" }),
}));
vi.mock("../../hooks/useIsMobile", () => ({ default: () => false }));

let capturedOnCapture = null;
vi.mock("../../hooks/usePhotoCapture", () => ({
  default: ({ onCapture }) => {
    capturedOnCapture = onCapture;
    return { requestCapture: vi.fn(), cameraModal: null };
  },
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
import { salaryApi, appointmentV1Api, authApi } from "../../utils/api";

const SAVE_CHANGES = /Save Changes & Next: Upload Documents/i;

const renderModal = () =>
  render(
    <AppointmentModal
      isOpen
      onClose={vi.fn()}
      onSuccess={vi.fn()}
      initialData={createInitialData()}
    />,
  );

const idle = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnCapture = null;
  setAppointmentRoute("");
  salaryApi.getDepartments.mockResolvedValue({ data: [{ name: "Production" }] });
  appointmentV1Api.listDocuments.mockResolvedValue({ data: { items: [] } });
  appointmentV1Api.uploadDocument.mockResolvedValue({ data: { documentId: 1 } });
  authApi.updateAppointment.mockResolvedValue({ user: { id: 145 } });
});

afterEach(() => setAppointmentRoute(""));

/**
 * The departments effect used to depend on the whole `user` object. Because the
 * auth context hands back a fresh object each render, every fetch set state,
 * every state change re-rendered, and every re-render fetched again — an
 * unbounded loop (84 requests in 300ms of idle) that also made React's act()
 * never settle, so the photo tests timed out rather than failing an assertion.
 */
describe("AppointmentModal — effects settle instead of looping", () => {
  it("loads departments once and then stays quiet", async () => {
    renderModal();
    await screen.findByRole("button", { name: SAVE_CHANGES });

    await act(async () => {
      await idle();
    });

    expect(salaryApi.getDepartments).toHaveBeenCalledTimes(1);
  });

  it("does not re-fetch departments when the form is edited", async () => {
    renderModal();
    // Any freely editable field will do; emp_code is locked in this modal.
    const field = await screen.findByDisplayValue("Dinesh Saini");

    await userEvent.clear(field);
    await userEvent.type(field, "Someone Else");

    await act(async () => {
      await idle();
    });

    // Typing changes form state only; it is not a reason to re-read departments.
    expect(salaryApi.getDepartments).toHaveBeenCalledTimes(1);
  });

  it("does not re-fetch departments when a photo is captured", async () => {
    renderModal();
    await screen.findByRole("button", { name: SAVE_CHANGES });

    await act(async () => capturedOnCapture(createPhotoFile()));
    await act(async () => {
      await idle();
    });

    expect(salaryApi.getDepartments).toHaveBeenCalledTimes(1);
  });

  it("settles quickly enough for act() to drain", async () => {
    renderModal();
    await screen.findByRole("button", { name: SAVE_CHANGES });

    // An unsettled render loop makes this hang until the test times out, which
    // is precisely how the original bug presented.
    await act(async () => {});

    expect(salaryApi.getDepartments).toHaveBeenCalledTimes(1);
  });
});
