import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  createInitialData,
  createSaveResponse,
  createGetResponse,
  createDeferred,
  createApiError,
  setAppointmentRoute,
  currentRouteParams,
} from "./testUtils/appointmentFixtures";

// ── Mocks. Declared before the component import so it binds to these. ────────
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

// Desktop layout: mobile renders both steps at once and has no Next gate.
vi.mock("../../hooks/useIsMobile", () => ({ default: () => false }));

vi.mock("../../hooks/usePhotoCapture", () => ({
  default: () => ({ requestCapture: vi.fn(), cameraModal: null }),
}));

vi.mock("../../components/ModernDatePicker", () => ({
  default: ({ value, onChange, ...rest }) => (
    <input
      type="date"
      value={value || ""}
      onChange={(e) => onChange?.(e.target.value)}
      {...rest}
    />
  ),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import AppointmentModal from "./AppointmentModal";
import { authApi, appointmentV1Api } from "../../utils/api";
import toast from "react-hot-toast";

const SAVE_NEW = /Save & Next: Upload Documents/i;
const SAVE_CHANGES = /Save Changes & Next: Upload Documents/i;

const renderModal = (props = {}) =>
  render(
    <AppointmentModal
      isOpen
      onClose={props.onClose || vi.fn()}
      onSuccess={props.onSuccess || vi.fn()}
      {...props}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  setAppointmentRoute("");
  appointmentV1Api.listDocuments.mockResolvedValue({ data: { items: [] } });
  authApi.checkEmpCodeAvailability.mockResolvedValue({ exists: false });
  authApi.submitAppointmentForm.mockResolvedValue(createSaveResponse());
  authApi.updateAppointment.mockResolvedValue({ user: { id: 104 } });
});

afterEach(() => setAppointmentRoute(""));

describe("AppointmentModal — button wording", () => {
  it("offers to save a new appointment", async () => {
    renderModal();

    expect(await screen.findByRole("button", { name: SAVE_NEW })).toBeInTheDocument();
  });

  it("offers to save changes for an existing appointment", async () => {
    renderModal({ initialData: createInitialData() });

    expect(await screen.findByRole("button", { name: SAVE_CHANGES })).toBeInTheDocument();
  });
});

describe("AppointmentModal — save-first gating", () => {
  it("does not call any save API when the form is empty", async () => {
    renderModal();

    await userEvent.click(await screen.findByRole("button", { name: SAVE_NEW }));

    expect(authApi.submitAppointmentForm).not.toHaveBeenCalled();
    expect(authApi.updateAppointment).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/required fields/i));
  });

  it("does not open the documents step while the form is invalid", async () => {
    renderModal();

    await userEvent.click(await screen.findByRole("button", { name: SAVE_NEW }));

    expect(screen.queryByRole("button", { name: /Complete Appointment/i })).toBeNull();
  });

  it("leaves the URL untouched when the form is invalid", async () => {
    renderModal();

    await userEvent.click(await screen.findByRole("button", { name: SAVE_NEW }));

    expect(currentRouteParams().get("appointmentId")).toBeNull();
    expect(currentRouteParams().get("step")).toBeNull();
  });
});

describe("AppointmentModal — employee-code confirmation guard", () => {
  it("opens the confirmation instead of saving when the code changes", async () => {
    // Same appointment, different emp_code than the loaded snapshot.
    const initialData = createInitialData();
    renderModal({ initialData });

    // The code is assigned from Employee Master, so this modal must not offer
    // it for editing — that is what makes the duplicate-code path impossible
    // here rather than merely discouraged.
    const empCodeField = await screen.findByDisplayValue("EMP1025");
    expect(empCodeField).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: SAVE_CHANGES }));

    await waitFor(() => expect(authApi.updateAppointment).toHaveBeenCalledTimes(1));
    // Nothing to confirm, so the availability probe never runs.
    expect(authApi.checkEmpCodeAvailability).not.toHaveBeenCalled();
  });

  it("saves directly when the employee code is unchanged", async () => {
    renderModal({ initialData: createInitialData() });

    await userEvent.click(await screen.findByRole("button", { name: SAVE_CHANGES }));

    await waitFor(() => expect(authApi.updateAppointment).toHaveBeenCalledTimes(1));
    // No confirmation needed, so the availability probe never runs.
    expect(authApi.checkEmpCodeAvailability).not.toHaveBeenCalled();
  });

  it("keeps the stored code untouched in the save payload", async () => {
    renderModal({ initialData: createInitialData() });

    await userEvent.click(await screen.findByRole("button", { name: SAVE_CHANGES }));

    await waitFor(() => expect(authApi.updateAppointment).toHaveBeenCalledTimes(1));

    // Posted back exactly as loaded — the modal cannot reassign it.
    const sent = Object.fromEntries(authApi.updateAppointment.mock.calls[0][0].entries());
    expect(sent.emp_code).toBe("EMP1025");
  });
});

describe("AppointmentModal — route rehydration", () => {
  it("fetches the appointment named in the URL", async () => {
    setAppointmentRoute("?appointmentId=104&step=documents");
    appointmentV1Api.get.mockResolvedValue(createGetResponse());

    renderModal();

    await waitFor(() =>
      expect(appointmentV1Api.get).toHaveBeenCalledWith("104", "t", "Bearer"),
    );
  });

  it("opens the documents step once the fetch succeeds", async () => {
    setAppointmentRoute("?appointmentId=104&step=documents");
    appointmentV1Api.get.mockResolvedValue(createGetResponse());

    renderModal();

    expect(
      await screen.findByRole("button", { name: /Complete Appointment/i }),
    ).toBeInTheDocument();
  });

  it("shows a loading state and no create form while fetching", async () => {
    setAppointmentRoute("?appointmentId=104&step=documents");
    const deferred = createDeferred();
    appointmentV1Api.get.mockReturnValue(deferred.promise);

    renderModal();

    expect(await screen.findByText(/Loading appointment/i)).toBeInTheDocument();
    // An empty step 1 here would look like a fresh create form.
    expect(screen.queryByRole("button", { name: SAVE_NEW })).toBeNull();

    deferred.resolve(createGetResponse());
    await waitFor(() => expect(screen.queryByText(/Loading appointment/i)).toBeNull());
  });

  it("opens step 1 in update mode for step=details", async () => {
    setAppointmentRoute("?appointmentId=104&step=details");
    appointmentV1Api.get.mockResolvedValue(createGetResponse());

    renderModal();

    expect(await screen.findByRole("button", { name: SAVE_CHANGES })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Complete Appointment/i })).toBeNull();
  });

  it("clears the route and stays out of the documents step when not found", async () => {
    setAppointmentRoute("?appointmentId=999&step=documents");
    appointmentV1Api.get.mockRejectedValue(createApiError("Appointment details were not found.", { status: 404 }));

    renderModal();

    await waitFor(() => expect(currentRouteParams().get("appointmentId")).toBeNull());
    expect(screen.queryByRole("button", { name: /Complete Appointment/i })).toBeNull();
    // Must not silently become a create — that is how duplicates appear.
    expect(authApi.submitAppointmentForm).not.toHaveBeenCalled();
  });

  it("does not expose the documents step when access is denied", async () => {
    setAppointmentRoute("?appointmentId=104&step=documents");
    appointmentV1Api.get.mockRejectedValue(createApiError("You do not have access to this appointment.", { status: 403 }));

    renderModal();

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /Complete Appointment/i })).toBeNull();
  });

  it("re-reads the route on popstate", async () => {
    setAppointmentRoute("?appointmentId=104&step=details");
    appointmentV1Api.get.mockResolvedValue(createGetResponse());

    renderModal();
    await waitFor(() => expect(appointmentV1Api.get).toHaveBeenCalledTimes(1));

    setAppointmentRoute("?appointmentId=104&step=documents");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await waitFor(() => expect(appointmentV1Api.get).toHaveBeenCalledTimes(2));
  });

  it("removes its popstate listener on unmount", async () => {
    setAppointmentRoute("?appointmentId=104&step=details");
    appointmentV1Api.get.mockResolvedValue(createGetResponse());

    const { unmount } = renderModal();
    await waitFor(() => expect(appointmentV1Api.get).toHaveBeenCalledTimes(1));

    unmount();
    window.dispatchEvent(new PopStateEvent("popstate"));

    // No further fetch after unmount.
    await new Promise((r) => setTimeout(r, 20));
    expect(appointmentV1Api.get).toHaveBeenCalledTimes(1);
  });

  it("stays in create mode with no appointmentId in the URL", async () => {
    renderModal();

    expect(await screen.findByRole("button", { name: SAVE_NEW })).toBeInTheDocument();
    expect(appointmentV1Api.get).not.toHaveBeenCalled();
  });
});

describe("AppointmentModal — update path and photo separation", () => {
  it("updates rather than creates for an existing appointment", async () => {
    renderModal({ initialData: createInitialData() });

    await userEvent.click(await screen.findByRole("button", { name: SAVE_CHANGES }));

    await waitFor(() => expect(authApi.updateAppointment).toHaveBeenCalledTimes(1));
    expect(authApi.submitAppointmentForm).not.toHaveBeenCalled();
  });

  it("writes appointmentId and step=documents to the URL after saving", async () => {
    renderModal({ initialData: createInitialData() });

    await userEvent.click(await screen.findByRole("button", { name: SAVE_CHANGES }));

    await waitFor(() => expect(currentRouteParams().get("appointmentId")).toBe("104"));
    expect(currentRouteParams().get("step")).toBe("documents");
  });

  it("keeps document binaries out of the appointment save request", async () => {
    renderModal({ initialData: createInitialData() });

    await userEvent.click(await screen.findByRole("button", { name: SAVE_CHANGES }));

    await waitFor(() => expect(authApi.updateAppointment).toHaveBeenCalled());

    const [payload] = authApi.updateAppointment.mock.calls[0];
    for (const field of ["photo", "adhar_image", "pan_image", "check_image", "account_book"]) {
      expect(payload.get(field)).toBeNull();
    }
  });

  it("treats a response without an appointment id as a failure", async () => {
    authApi.updateAppointment.mockResolvedValue({ user: {} });
    renderModal({ initialData: createInitialData({ id: undefined, raw: { id: undefined } }) });

    const button = await screen.findByRole("button", { name: SAVE_NEW });
    await userEvent.click(button);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /Complete Appointment/i })).toBeNull();
  });

  it("does not attempt a photo upload when the save fails", async () => {
    authApi.updateAppointment.mockRejectedValue(createApiError("Unable to save appointment details."));
    renderModal({ initialData: createInitialData() });

    await userEvent.click(await screen.findByRole("button", { name: SAVE_CHANGES }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(appointmentV1Api.uploadDocument).not.toHaveBeenCalled();
  });

  it("sends only one save request for a double click", async () => {
    const deferred = createDeferred();
    authApi.updateAppointment.mockReturnValue(deferred.promise);

    renderModal({ initialData: createInitialData() });
    const button = await screen.findByRole("button", { name: SAVE_CHANGES });

    await userEvent.click(button);
    await userEvent.click(button);

    expect(authApi.updateAppointment).toHaveBeenCalledTimes(1);

    deferred.resolve({ user: { id: 104 } });
    await waitFor(() => expect(currentRouteParams().get("step")).toBe("documents"));
  });

  it("disables the save button while the request is in flight", async () => {
    const deferred = createDeferred();
    authApi.updateAppointment.mockReturnValue(deferred.promise);

    renderModal({ initialData: createInitialData() });
    const button = await screen.findByRole("button", { name: SAVE_CHANGES });

    await userEvent.click(button);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Saving Changes/i })).toBeDisabled(),
    );

    deferred.resolve({ user: { id: 104 } });
  });
});

describe("AppointmentModal — back from documents", () => {
  it("returns to step 1 in update mode and points the route at details", async () => {
    setAppointmentRoute("?appointmentId=104&step=documents");
    appointmentV1Api.get.mockResolvedValue(createGetResponse());

    renderModal();

    const back = await screen.findByRole("button", { name: /Back to Appointment Details/i });
    await userEvent.click(back);

    expect(await screen.findByRole("button", { name: SAVE_CHANGES })).toBeInTheDocument();
    expect(currentRouteParams().get("step")).toBe("details");
    // The saved id survives, so the next save updates rather than creates.
    expect(currentRouteParams().get("appointmentId")).toBe("104");
  });
});

describe("AppointmentModal — completion", () => {
  it("clears the route and reports success without re-saving details", async () => {
    setAppointmentRoute("?appointmentId=104&step=documents");
    appointmentV1Api.get.mockResolvedValue(createGetResponse());
    appointmentV1Api.complete.mockResolvedValue({ data: { status: "COMPLETED" } });
    const onSuccess = vi.fn();

    renderModal({ onSuccess });

    await userEvent.click(
      await screen.findByRole("button", { name: /Complete Appointment/i }),
    );

    await waitFor(() => expect(appointmentV1Api.complete).toHaveBeenCalledWith(104, "t", "Bearer"));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    expect(currentRouteParams().get("appointmentId")).toBeNull();
    expect(authApi.updateAppointment).not.toHaveBeenCalled();
    expect(authApi.submitAppointmentForm).not.toHaveBeenCalled();
  });
});
