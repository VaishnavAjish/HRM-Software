import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  createInitialData,
  createDeferred,
  createApiError,
  createPhotoFile,
  setAppointmentRoute,
  currentRouteParams,
} from "./testUtils/appointmentFixtures";
import { PHOTO_DOCUMENT_TYPE } from "./documentTypes";

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

// Exposes a button that hands a File to the modal's onCapture, standing in for
// the camera so the photo path can be driven from a test.
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
import { authApi, appointmentV1Api } from "../../utils/api";
import toast from "react-hot-toast";

const SAVE_CHANGES = /Save Changes & Next: Upload Documents/i;
const CONFIRM = /^(Confirm|Yes, Assign|Assign|Continue|Yes)/i;

const renderModal = (props = {}) =>
  render(<AppointmentModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} {...props} />);

const saveStep1 = async () =>
  userEvent.click(await screen.findByRole("button", { name: SAVE_CHANGES }));

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnCapture = null;
  setAppointmentRoute("");
  appointmentV1Api.listDocuments.mockResolvedValue({ data: { items: [] } });
  appointmentV1Api.uploadDocument.mockResolvedValue({ data: { documentId: 1 } });
  authApi.checkEmpCodeAvailability.mockResolvedValue({ exists: false });
  authApi.updateAppointment.mockResolvedValue({ user: { id: 104 } });
});

afterEach(() => setAppointmentRoute(""));

/**
 * The employee code is assigned from Employee Master, so this modal renders it
 * read-only. formData.emp_code therefore cannot diverge from the snapshot taken
 * when the modal opened, which means the duplicate-code confirmation dialog is
 * no longer reachable from here — these cover the save path that replaced it.
 */
describe("saving step 1 — the employee code is read-only", () => {
  it("performs exactly one update and opens the documents step", async () => {
    renderModal({ initialData: createInitialData() });

    await saveStep1();

    await waitFor(() => expect(authApi.updateAppointment).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByRole("button", { name: /Complete Appointment/i }),
    ).toBeInTheDocument();
    expect(currentRouteParams().get("step")).toBe("documents");
    expect(currentRouteParams().get("appointmentId")).toBe("104");
  });

  it("never opens the duplicate-code confirmation", async () => {
    renderModal({ initialData: createInitialData() });

    expect(await screen.findByDisplayValue("EMP1025")).toBeDisabled();

    await saveStep1();
    await waitFor(() => expect(authApi.updateAppointment).toHaveBeenCalledTimes(1));

    // No reassignment is possible, so the availability probe has nothing to ask.
    expect(authApi.checkEmpCodeAvailability).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: CONFIRM })).toBeNull();
  });

  it("sends one request when Save is double-clicked", async () => {
    const deferred = createDeferred();
    authApi.updateAppointment.mockReturnValue(deferred.promise);

    renderModal({ initialData: createInitialData() });

    const save = await screen.findByRole("button", { name: SAVE_CHANGES });
    await userEvent.click(save);
    await userEvent.click(save).catch(() => {});

    expect(authApi.updateAppointment).toHaveBeenCalledTimes(1);

    deferred.resolve({ user: { id: 104 } });
    await waitFor(() => expect(currentRouteParams().get("step")).toBe("documents"));
  });

  it("keeps the user on step 1 when the save fails", async () => {
    authApi.updateAppointment.mockRejectedValue(
      createApiError("Unable to save appointment details."),
    );

    renderModal({ initialData: createInitialData() });
    await saveStep1();

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /Complete Appointment/i })).toBeNull();
    expect(currentRouteParams().get("step")).not.toBe("documents");
    // The form is still there to retry from.
    expect(screen.getByDisplayValue("EMP1025")).toBeInTheDocument();
  });
});

describe("profile photo — uploaded separately after the appointment exists", () => {
  // The immediate- and deferred-resolution paths are asserted identically: a
  // save that resolves within the click's own microtask must reach the upload
  // exactly like one that resolves later, and must send the same File object.
  it("uploads as PHOTOGRAPH against the returned appointment id when the save resolves immediately", async () => {
    authApi.updateAppointment.mockResolvedValue({ user: { id: 145 } });
    const photo = createPhotoFile();

    renderModal({ initialData: createInitialData() });
    await screen.findByRole("button", { name: SAVE_CHANGES });

    // Hand the modal a photo the way the camera hook would.
    expect(capturedOnCapture).toBeTypeOf("function");
    await act(async () => capturedOnCapture(photo));

    await userEvent.click(screen.getByRole("button", { name: SAVE_CHANGES }));

    await waitFor(() => expect(appointmentV1Api.uploadDocument).toHaveBeenCalledTimes(1));

    const [appointmentId, payload] = appointmentV1Api.uploadDocument.mock.calls[0];
    expect(appointmentId).toBe(145);
    expect(payload.documentType).toBe(PHOTO_DOCUMENT_TYPE);
    // The exact File captured before Save, not a re-read of state.
    expect(payload.file).toBe(photo);
    expect(authApi.updateAppointment).toHaveBeenCalledTimes(1);
  });

  it("uploads the photo only after the appointment save resolves", async () => {
    const deferred = createDeferred();
    authApi.updateAppointment.mockReturnValue(deferred.promise);
    const photo = createPhotoFile();

    renderModal({ initialData: createInitialData() });
    await screen.findByRole("button", { name: SAVE_CHANGES });
    await act(async () => capturedOnCapture(photo));

    await userEvent.click(screen.getByRole("button", { name: SAVE_CHANGES }));

    // Save still in flight: there is no id yet, so no upload may have started.
    expect(appointmentV1Api.uploadDocument).not.toHaveBeenCalled();

    deferred.resolve({ user: { id: 145 } });
    await waitFor(() => expect(appointmentV1Api.uploadDocument).toHaveBeenCalledTimes(1));

    // Same id shape, same type and same File as the immediate path.
    const [appointmentId, payload] = appointmentV1Api.uploadDocument.mock.calls[0];
    expect(appointmentId).toBe(145);
    expect(payload.documentType).toBe(PHOTO_DOCUMENT_TYPE);
    expect(payload.file).toBe(photo);
  });

  it("keeps the appointment saved and reaches step 2 when the photo upload fails", async () => {
    authApi.updateAppointment.mockResolvedValue({ user: { id: 145 } });
    appointmentV1Api.uploadDocument.mockRejectedValue(new Error("S3 unavailable"));

    renderModal({ initialData: createInitialData() });
    await screen.findByRole("button", { name: SAVE_CHANGES });
    await act(async () => capturedOnCapture(createPhotoFile()));

    await userEvent.click(screen.getByRole("button", { name: SAVE_CHANGES }));

    await waitFor(() => expect(appointmentV1Api.uploadDocument).toHaveBeenCalled());

    // A photo failure must not undo the saved appointment.
    expect(authApi.updateAppointment).toHaveBeenCalledTimes(1);
    expect(authApi.submitAppointmentForm).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("button", { name: /Complete Appointment/i }),
    ).toBeInTheDocument();
    expect(currentRouteParams().get("appointmentId")).toBe("145");
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/photo upload failed/i)),
    );
  });

  it("does not upload a photo when none was selected", async () => {
    renderModal({ initialData: createInitialData() });

    await userEvent.click(await screen.findByRole("button", { name: SAVE_CHANGES }));

    await waitFor(() => expect(authApi.updateAppointment).toHaveBeenCalled());
    expect(appointmentV1Api.uploadDocument).not.toHaveBeenCalled();
  });
});
