import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mocked before the component is imported so it picks these up.
vi.mock("../../utils/api", () => ({
  // AppointmentModal and TrialFormModal import this helper from utils/api to
  // resolve the company a write belongs to. A vi.mock factory replaces the whole
  // module, so omitting it makes the import undefined and the save throws before
  // it reaches the API — which reads as "nothing was submitted".
  resolveWriteCompanyId: (value) => value,
  appointmentV1Api: {
    listDocuments: vi.fn(),
    uploadDocument: vi.fn(),
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
  useAuth: () => ({ user: { accessToken: "t", tokenType: "Bearer" } }),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import AppointmentDocumentsStep from "./AppointmentDocumentsStep";
import { appointmentV1Api, documentV1Api } from "../../utils/api";
import toast from "react-hot-toast";

const APPOINTMENT_ID = 104;

const documentRow = {
  documentId: 9,
  documentType: "PAN_CARD",
  documentLabel: "PAN Card",
  status: "ACTIVE",
  version: 1,
  createdAt: "2026-07-30T10:00:00Z",
  currentVersion: {
    versionId: 21,
    version: 1,
    fileName: "PAN_CARD_V1_20260730100000.pdf",
    originalFileName: "my-pan.pdf",
    mimeType: "application/pdf",
    fileSize: 2048,
    uploadedAt: "2026-07-30T10:00:00Z",
  },
  actions: { view: true, download: true, replace: true, delete: true },
};

const renderStep = (props = {}) =>
  render(
    <AppointmentDocumentsStep
      appointmentId={APPOINTMENT_ID}
      summary={{ appointmentNumber: "APT-000104", aadhaarMasked: "XXXX XXXX 9012" }}
      onBack={props.onBack || vi.fn()}
      onComplete={props.onComplete || vi.fn()}
      {...props}
    />,
  );

describe("AppointmentDocumentsStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appointmentV1Api.listDocuments.mockResolvedValue({
      data: { items: [documentRow], total: 1 },
    });
  });

  it("lists documents by appointmentId, never by employeeId", async () => {
    renderStep();

    await waitFor(() => expect(appointmentV1Api.listDocuments).toHaveBeenCalled());

    expect(appointmentV1Api.listDocuments).toHaveBeenCalledWith(
      APPOINTMENT_ID,
      "t",
      "Bearer",
    );

    // The employee-scoped list would mix in other appointments' documents.
    const sentArgs = JSON.stringify(appointmentV1Api.listDocuments.mock.calls);
    expect(sentArgs).not.toContain("employeeId");
  });

  it("renders the returned documents", async () => {
    renderStep();

    // "PAN Card" also appears as a <option> in the type dropdown, so assert on
    // the filename cell, which only exists once the row has rendered.
    expect(await screen.findByText("my-pan.pdf")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("shows an empty state when there are none", async () => {
    appointmentV1Api.listDocuments.mockResolvedValue({ data: { items: [] } });

    renderStep();

    expect(await screen.findByText(/No documents uploaded yet/i)).toBeInTheDocument();
  });

  it("surfaces a list failure with a retry", async () => {
    appointmentV1Api.listDocuments.mockRejectedValue(new Error("boom"));

    renderStep();

    expect(await screen.findByText("boom")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("refetches the appointment-scoped list after a delete", async () => {
    documentV1Api.remove.mockResolvedValue({});
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderStep();
    await screen.findByText("my-pan.pdf");

    await userEvent.click(screen.getByTitle("Delete"));

    await waitFor(() => expect(documentV1Api.remove).toHaveBeenCalledWith(9, "t", "Bearer"));
    // Once on mount, once after the delete.
    await waitFor(() => expect(appointmentV1Api.listDocuments).toHaveBeenCalledTimes(2));
  });

  it("requests a fresh download URL rather than storing one", async () => {
    documentV1Api.downloadUrl.mockResolvedValue({ data: { url: "https://s3/signed" } });
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, assign },
      writable: true,
    });

    renderStep();
    await screen.findByText("my-pan.pdf");

    await userEvent.click(screen.getByTitle("Download"));

    await waitFor(() =>
      expect(documentV1Api.downloadUrl).toHaveBeenCalledWith(9, null, "t", "Bearer"),
    );
  });

  it("calls the completion endpoint and reports back", async () => {
    appointmentV1Api.complete.mockResolvedValue({ data: { status: "COMPLETED" } });
    const onComplete = vi.fn();

    renderStep({ onComplete });
    await screen.findByText("my-pan.pdf");

    await userEvent.click(screen.getByRole("button", { name: /Complete Appointment/i }));

    await waitFor(() =>
      expect(appointmentV1Api.complete).toHaveBeenCalledWith(APPOINTMENT_ID, "t", "Bearer"),
    );
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });

  it("stays on step 2 and names the missing documents when completion is refused", async () => {
    const err = new Error("Upload the required documents");
    err.data = { error: { details: { missing: ["AADHAR_CARD"] } } };
    appointmentV1Api.complete.mockRejectedValue(err);
    const onComplete = vi.fn();

    renderStep({ onComplete });
    await screen.findByText("my-pan.pdf");

    await userEvent.click(screen.getByRole("button", { name: /Complete Appointment/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("AADHAR_CARD"),
      ),
    );
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("invokes onBack from Back to Appointment Details", async () => {
    const onBack = vi.fn();

    renderStep({ onBack });
    await screen.findByText("my-pan.pdf");

    await userEvent.click(
      screen.getByRole("button", { name: /Back to Appointment Details/i }),
    );

    expect(onBack).toHaveBeenCalled();
  });
});
