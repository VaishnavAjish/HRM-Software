import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../utils/api", () => ({
  // AppointmentModal and TrialFormModal import this helper from utils/api to
  // resolve the company a write belongs to. A vi.mock factory replaces the whole
  // module, so omitting it makes the import undefined and the save throws before
  // it reaches the API — which reads as "nothing was submitted".
  resolveWriteCompanyId: (value) => value,
  authApi: {
    submitTrialForm: vi.fn(),
    updateTrialForm: vi.fn(),
  },
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: { accessToken: "t", tokenType: "Bearer", role: "admin" } }),
}));

// TrialFormModal reads useCompany() to seed the company field. Without this the
// hook returns null outside a provider and the component throws while
// destructuring, which failed all eight tests in this file.
vi.mock("../../context/CompanyContext", () => ({
  useCompany: () => ({
    companyId: "nidhi-impex",
    isAllCompanies: false,
    companyOptions: [],
  }),
}));

vi.mock("../../components/ModernDatePicker", () => ({
  default: ({ value, onChange, ...rest }) => (
    <input type="date" value={value || ""} onChange={(e) => onChange?.(e.target.value)} {...rest} />
  ),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import TrialFormModal from "./TrialFormModal";
import { authApi } from "../../utils/api";

/** A trial row in the shape the trials list passes in. */
const trialRow = (overrides = {}) => ({
  id: 51,
  raw: {
    form_no: "TF-100",
    trial_date: "2026-07-01",
    department: "Production",
    name: "Rohit Kumar",
    address: "12 Main Road",
    mobile_number: "9876543210",
    mobile_no_2: "",
    gender: "MALE",
    email: "rohit@example.com",
    unit: "Ichapur",
    last_company_name: "Acme",
    last_company_address: "Surat",
    experience: "2 years",
    reason_for_leaving: "Relocation",
    hastak_name: "Dinesh",
    hastak_code: "H12",
    hastak_mobile: "8107562363",
    contractor: "None",
    manager_name: "Ketan",
    akar: "A1",
    emp_signature: "RAJESH",
    manager_signature: "",
    hastak_signature: "",
    hr_signature: "",
    ...(overrides.raw || {}),
  },
  ...overrides,
});

const renderModal = (props = {}) =>
  render(
    <TrialFormModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} initialData={null} {...props} />,
  );

const nameField = () => screen.getByDisplayValue("Rohit Kumar");

beforeEach(() => {
  vi.clearAllMocks();
  authApi.submitTrialForm.mockResolvedValue({ message: "saved" });
  authApi.updateTrialForm.mockResolvedValue({ message: "updated" });
});

/**
 * The open/populate work used to run in an effect keyed on `isOpen`, assigning
 * form state synchronously in the effect body. That renders the previous
 * trial's values first and replaces them a render later. It is now applied
 * during the open transition; these tests pin the behaviour that must not
 * change as a result.
 */
describe("TrialFormModal — open/reset behaviour", () => {
  it("opens a new trial with an empty form", async () => {
    renderModal();

    expect(await screen.findByRole("button", { name: /Submit Trial Form/i })).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Rohit Kumar")).toBeNull();
    expect(screen.queryByDisplayValue("TF-100")).toBeNull();
  });

  it("opens an existing trial with its values already in place", async () => {
    renderModal({ initialData: trialRow() });

    expect(await screen.findByDisplayValue("Rohit Kumar")).toBeInTheDocument();
    expect(screen.getByDisplayValue("TF-100")).toBeInTheDocument();
    expect(screen.getByDisplayValue("9876543210")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Update Trial Form/i })).toBeInTheDocument();
  });

  it("keeps what the user typed when the parent re-renders with the same trial", async () => {
    const initialData = trialRow();
    const { rerender } = renderModal({ initialData });

    const field = await screen.findByDisplayValue("Rohit Kumar");
    await userEvent.clear(field);
    await userEvent.type(field, "Edited Name");

    // Same isOpen, same record — a re-render must not throw the edit away.
    rerender(
      <TrialFormModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} initialData={initialData} />,
    );

    expect(screen.getByDisplayValue("Edited Name")).toBeInTheDocument();
  });

  it("loads the new record when the modal is reopened for a different trial", async () => {
    const { rerender } = renderModal({ initialData: trialRow() });
    await screen.findByDisplayValue("Rohit Kumar");

    // Closing and reopening is how the list swaps records.
    rerender(
      <TrialFormModal isOpen={false} onClose={vi.fn()} onSuccess={vi.fn()} initialData={trialRow()} />,
    );
    rerender(
      <TrialFormModal
        isOpen
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        initialData={trialRow({ id: 52, raw: { name: "Second Person", form_no: "TF-200" } })}
      />,
    );

    expect(await screen.findByDisplayValue("Second Person")).toBeInTheDocument();
    expect(screen.getByDisplayValue("TF-200")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Rohit Kumar")).toBeNull();
  });

  it("comes back empty when reopened for a new trial after editing one", async () => {
    const { rerender } = renderModal({ initialData: trialRow() });
    await screen.findByDisplayValue("Rohit Kumar");

    rerender(
      <TrialFormModal isOpen={false} onClose={vi.fn()} onSuccess={vi.fn()} initialData={null} />,
    );
    rerender(<TrialFormModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} initialData={null} />);

    expect(
      await screen.findByRole("button", { name: /Submit Trial Form/i }),
    ).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Rohit Kumar")).toBeNull();
  });

  it("settles instead of looping while the modal sits open", async () => {
    renderModal({ initialData: trialRow() });
    await screen.findByDisplayValue("Rohit Kumar");

    // A render loop leaves React work permanently queued and this never returns.
    const { act } = await import("@testing-library/react");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    expect(nameField()).toBeInTheDocument();
  });
});

describe("TrialFormModal — submission", () => {
  it("creates a new trial with the entered values", async () => {
    renderModal();

    await userEvent.type(screen.getByRole("textbox", { name: /Name of Employee/i }), "New Person");
    await userEvent.type(screen.getByRole("textbox", { name: /Mobile No 1/i }), "9876543210");
    await userEvent.click(screen.getByRole("button", { name: /Submit Trial Form/i }));

    await waitFor(() => expect(authApi.submitTrialForm).toHaveBeenCalledTimes(1));

    const payload = authApi.submitTrialForm.mock.calls[0][0];
    expect(payload.get("name")).toBe("New Person");
    expect(payload.get("mobile_number")).toBe("9876543210");
    expect(authApi.updateTrialForm).not.toHaveBeenCalled();
  });

  it("sends only the changed fields when updating", async () => {
    renderModal({ initialData: trialRow() });

    const field = await screen.findByDisplayValue("Rohit Kumar");
    await userEvent.clear(field);
    await userEvent.type(field, "Rohit Saket");

    await userEvent.click(screen.getByRole("button", { name: /Update Trial Form/i }));

    await waitFor(() => expect(authApi.updateTrialForm).toHaveBeenCalledTimes(1));

    const [id, payload] = authApi.updateTrialForm.mock.calls[0];
    expect(id).toBe(51);
    expect(payload.get("name")).toBe("Rohit Saket");
    // The snapshot taken when the modal opened keeps untouched fields out.
    expect(payload.get("department")).toBeNull();
    expect(payload.get("mobile_number")).toBeNull();
    expect(authApi.submitTrialForm).not.toHaveBeenCalled();
  });
});
