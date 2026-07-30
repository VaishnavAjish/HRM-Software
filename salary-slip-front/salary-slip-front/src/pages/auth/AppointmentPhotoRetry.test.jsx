import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  createInitialData,
  createDeferred,
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
import AppointmentDocumentsStep from "./AppointmentDocumentsStep";
import { authApi, appointmentV1Api } from "../../utils/api";

const SAVE_CHANGES = /Save Changes & Next: Upload Documents/i;
const RETRY_UPLOAD = /Retry Upload/i;
const REMOVE_PHOTO = /Remove Photo/i;

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnCapture = null;
  setAppointmentRoute("");
  appointmentV1Api.listDocuments.mockResolvedValue({ data: { items: [] } });
  appointmentV1Api.uploadDocument.mockResolvedValue({ data: { documentId: 1 } });
  authApi.checkEmpCodeAvailability.mockResolvedValue({ exists: false });
  authApi.updateAppointment.mockResolvedValue({ user: { id: 145 } });
});

afterEach(() => setAppointmentRoute(""));

/* ─── Step 2 in isolation ─── */

const renderStep = (props = {}) =>
  render(
    <AppointmentDocumentsStep
      appointmentId={145}
      summary={{ appointmentNumber: "APT-000145" }}
      onBack={vi.fn()}
      onComplete={vi.fn()}
      {...props}
    />,
  );

describe("pending profile photo — retry control", () => {
  it("shows no banner when there is no pending photo", async () => {
    renderStep();

    await waitFor(() => expect(appointmentV1Api.listDocuments).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: RETRY_UPLOAD })).toBeNull();
  });

  it("offers a retry when a photo is outstanding", async () => {
    renderStep({ pendingPhoto: createPhotoFile() });

    expect(await screen.findByText(/Profile photo upload failed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: RETRY_UPLOAD })).toBeEnabled();
    expect(screen.getByRole("button", { name: REMOVE_PHOTO })).toBeEnabled();
  });

  it("retries the same file against the same appointment, as PHOTOGRAPH", async () => {
    const photo = createPhotoFile();
    renderStep({ pendingPhoto: photo });

    await userEvent.click(await screen.findByRole("button", { name: RETRY_UPLOAD }));

    await waitFor(() => expect(appointmentV1Api.uploadDocument).toHaveBeenCalledTimes(1));

    const [appointmentId, payload] = appointmentV1Api.uploadDocument.mock.calls[0];
    expect(appointmentId).toBe(145);
    expect(payload.file).toBe(photo);
    expect(payload.documentType).toBe(PHOTO_DOCUMENT_TYPE);
    expect(PHOTO_DOCUMENT_TYPE).toBe("PHOTOGRAPH");
  });

  it("never re-creates or re-saves the appointment", async () => {
    renderStep({ pendingPhoto: createPhotoFile() });

    await userEvent.click(await screen.findByRole("button", { name: RETRY_UPLOAD }));

    await waitFor(() => expect(appointmentV1Api.uploadDocument).toHaveBeenCalled());
    expect(authApi.submitAppointmentForm).not.toHaveBeenCalled();
    expect(authApi.updateAppointment).not.toHaveBeenCalled();
  });

  it("reports success upward and refreshes the document list", async () => {
    const onPendingPhotoUploaded = vi.fn();
    renderStep({ pendingPhoto: createPhotoFile(), onPendingPhotoUploaded });

    await waitFor(() => expect(appointmentV1Api.listDocuments).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: RETRY_UPLOAD }));

    await waitFor(() => expect(onPendingPhotoUploaded).toHaveBeenCalledTimes(1));
    // Once on mount, once after the photo landed.
    await waitFor(() => expect(appointmentV1Api.listDocuments).toHaveBeenCalledTimes(2));
  });

  it("disables the controls while the retry is in flight", async () => {
    const deferred = createDeferred();
    appointmentV1Api.uploadDocument.mockReturnValue(deferred.promise);

    renderStep({ pendingPhoto: createPhotoFile() });
    await userEvent.click(await screen.findByRole("button", { name: RETRY_UPLOAD }));

    expect(await screen.findByRole("button", { name: /Uploading…/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: REMOVE_PHOTO })).toBeDisabled();

    await act(async () => {
      deferred.resolve({ data: { documentId: 5 } });
    });
  });

  it("keeps the retry available after a second failure", async () => {
    const onPendingPhotoUploaded = vi.fn();
    appointmentV1Api.uploadDocument.mockRejectedValue(new Error("S3 unavailable"));

    renderStep({ pendingPhoto: createPhotoFile(), onPendingPhotoUploaded });

    await userEvent.click(await screen.findByRole("button", { name: RETRY_UPLOAD }));
    await waitFor(() => expect(appointmentV1Api.uploadDocument).toHaveBeenCalledTimes(1));

    // The file is not thrown away on failure, so a further attempt is possible.
    expect(onPendingPhotoUploaded).not.toHaveBeenCalled();
    const retry = await screen.findByRole("button", { name: RETRY_UPLOAD });
    expect(retry).toBeEnabled();

    await userEvent.click(retry);
    await waitFor(() => expect(appointmentV1Api.uploadDocument).toHaveBeenCalledTimes(2));
  });

  it("hands Remove Photo straight to the parent without uploading", async () => {
    const onDiscardPendingPhoto = vi.fn();
    renderStep({ pendingPhoto: createPhotoFile(), onDiscardPendingPhoto });

    await userEvent.click(await screen.findByRole("button", { name: REMOVE_PHOTO }));

    expect(onDiscardPendingPhoto).toHaveBeenCalledTimes(1);
    expect(appointmentV1Api.uploadDocument).not.toHaveBeenCalled();
  });
});

/* ─── The whole modal: failed auto-upload through to retry ─── */

describe("pending profile photo — end to end from a failed save", () => {
  /** Save an appointment whose photo upload fails, landing on step 2. */
  async function saveWithFailingPhoto() {
    appointmentV1Api.uploadDocument.mockRejectedValueOnce(new Error("S3 unavailable"));

    render(<AppointmentModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} initialData={createInitialData()} />);
    await screen.findByRole("button", { name: SAVE_CHANGES });
    await act(async () => capturedOnCapture(createPhotoFile()));

    await userEvent.click(screen.getByRole("button", { name: SAVE_CHANGES }));
    await waitFor(() => expect(appointmentV1Api.uploadDocument).toHaveBeenCalledTimes(1));
  }

  it("keeps the appointment and surfaces a retry on step 2", async () => {
    await saveWithFailingPhoto();

    expect(
      await screen.findByRole("button", { name: /Complete Appointment/i }),
    ).toBeInTheDocument();
    expect(currentRouteParams().get("appointmentId")).toBe("145");
    expect(await screen.findByRole("button", { name: RETRY_UPLOAD })).toBeInTheDocument();
    expect(authApi.updateAppointment).toHaveBeenCalledTimes(1);
  });

  it("retries against the saved id without touching the appointment again", async () => {
    await saveWithFailingPhoto();

    await userEvent.click(await screen.findByRole("button", { name: RETRY_UPLOAD }));

    await waitFor(() => expect(appointmentV1Api.uploadDocument).toHaveBeenCalledTimes(2));

    const [appointmentId, payload] = appointmentV1Api.uploadDocument.mock.calls[1];
    expect(appointmentId).toBe(145);
    expect(payload.documentType).toBe(PHOTO_DOCUMENT_TYPE);
    expect(payload.file).toBeInstanceOf(File);
    // The same File the first attempt sent, not a fresh read of empty state.
    expect(payload.file).toBe(appointmentV1Api.uploadDocument.mock.calls[0][1].file);

    // Still exactly one save — retry must not re-post the appointment.
    expect(authApi.updateAppointment).toHaveBeenCalledTimes(1);
    expect(authApi.submitAppointmentForm).not.toHaveBeenCalled();
  });

  it("clears the banner once the retry succeeds", async () => {
    await saveWithFailingPhoto();

    await userEvent.click(await screen.findByRole("button", { name: RETRY_UPLOAD }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: RETRY_UPLOAD })).toBeNull(),
    );
    expect(screen.queryByText(/Profile photo upload failed/i)).toBeNull();
  });

  it("lets the user drop the photo while the appointment stays saved", async () => {
    await saveWithFailingPhoto();

    await userEvent.click(await screen.findByRole("button", { name: REMOVE_PHOTO }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: RETRY_UPLOAD })).toBeNull(),
    );
    // Only the original failed attempt — removing uploads nothing.
    expect(appointmentV1Api.uploadDocument).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: /Complete Appointment/i }),
    ).toBeInTheDocument();
    expect(currentRouteParams().get("appointmentId")).toBe("145");
  });
});
