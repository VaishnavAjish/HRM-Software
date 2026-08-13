import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-hot-toast", () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toast };
});

vi.mock("../../../../utils/api", () => ({
  hrApi: {
    getRequisitions: vi.fn(),
    getRequisition: vi.fn(),
    storeRequisition: vi.fn(),
    updateRequisition: vi.fn(),
    deleteRequisition: vi.fn(),
    approveRequisition: vi.fn(),
    publishRequisition: vi.fn(),
    publishToIndeed: vi.fn(),
    getDepartmentManagers: vi.fn(),
  },
  rbacApi: {
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
  },
}));

const USER = { accessToken: "t", tokenType: "Bearer" };
const SCOPE = { company_code: "alpha" };

vi.mock("../../../../context/AuthContext", () => ({
  useAuth: () => ({ user: USER }),
}));

vi.mock("../../../../context/CompanyContext", () => ({
  useCompany: () => ({ companyScope: SCOPE, scopeKey: "alpha" }),
}));

vi.mock("./useHrFilters", () => ({
  default: () => ({
    filters: {},
    debouncedSearch: "",
    selectedIds: [],
    toggleSelected: vi.fn(),
    setAllSelected: vi.fn(),
    clearSelected: vi.fn(),
  }),
}));

vi.mock("./HiringFilterBar", () => ({ default: () => null }));
vi.mock("./RequisitionDrawer", () => ({ default: () => null }));

vi.mock("../../../../components/ui/RichTextEditor", () => ({
  default: ({ value, onChange, placeholder }) => (
    <textarea aria-label={placeholder || "rich-text"} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock("../../../../components/ui/DatePicker", () => ({
  default: ({ value, onChange }) => (
    <input aria-label="Target Closing Date" value={value || ""} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import toast from "react-hot-toast";
import { hrApi, rbacApi } from "../../../../utils/api";
import RequisitionsTab from "./RequisitionsTab";

const DEPARTMENTS = [
  { id: 1, name: "Engineering" },
  { id: 2, name: "Sales" },
  { id: null, name: "Legacy Only" },
];

const RAHUL = { id: 7, name: "Rahul Sharma", designation: "Engineering Manager" };
const PRIYA = { id: 8, name: "Priya Verma", designation: "Tech Lead" };
const SALES_A = { id: 9, name: "Sales Head A", designation: null };
const SALES_B = { id: 10, name: "Sales Head B", designation: null };

beforeEach(() => {
  vi.clearAllMocks();
  hrApi.getRequisitions.mockResolvedValue({ status: true, data: { data: [], total: 0 } });
  rbacApi.getSettings.mockResolvedValue({ status: true, data: [] });
  hrApi.getDepartmentManagers.mockResolvedValue({ status: true, data: [] });
});

const openWizard = async () => {
  render(<RequisitionsTab departments={DEPARTMENTS} people={[]} />);
  await screen.findByText("No job requisitions match these filters");
  await userEvent.click(screen.getByRole("button", { name: /new requisition/i }));
};

const deptSelect = () => screen.getByRole("combobox", { name: "Department" });
const managerSelect = () => screen.getByRole("combobox", { name: "Department Manager" });
const nextButton = () => screen.getByRole("button", { name: /next/i });

describe("Step 1", () => {
  it("opens the department step first, not the requisition form", async () => {
    await openWizard();

    expect(deptSelect()).toBeInTheDocument();
    expect(managerSelect()).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument();
  });

  it("hides departments that only exist as free-text names", async () => {
    await openWizard();

    const labels = Array.from(deptSelect().options).map((o) => o.textContent);
    expect(labels).toContain("Engineering");
    expect(labels).not.toContain("Legacy Only");
  });

  it("disables the manager select and Next until a department is chosen", async () => {
    await openWizard();

    expect(managerSelect()).toBeDisabled();
    expect(nextButton()).toBeDisabled();
    expect(hrApi.getDepartmentManagers).not.toHaveBeenCalled();
  });

  it("loads managers for the chosen department", async () => {
    hrApi.getDepartmentManagers.mockResolvedValue({ status: true, data: [RAHUL, PRIYA] });
    await openWizard();

    await userEvent.selectOptions(deptSelect(), "1");

    expect(hrApi.getDepartmentManagers).toHaveBeenCalledWith("1", "t", "Bearer", expect.objectContaining({ company_code: "alpha" }));
    await screen.findByRole("option", { name: /rahul sharma/i });
    expect(nextButton()).toBeDisabled();
  });

  it("auto-selects the manager when exactly one exists and enables Next", async () => {
    hrApi.getDepartmentManagers.mockResolvedValue({ status: true, data: [RAHUL] });
    await openWizard();

    await userEvent.selectOptions(deptSelect(), "1");

    await waitFor(() => expect(managerSelect().value).toBe("7"));
    expect(nextButton()).toBeEnabled();
  });

  it("clears the selected manager when the department changes", async () => {
    hrApi.getDepartmentManagers.mockImplementation((deptId) =>
      Promise.resolve({ status: true, data: deptId === "1" ? [RAHUL, PRIYA] : [SALES_A, SALES_B] }));
    await openWizard();

    await userEvent.selectOptions(deptSelect(), "1");
    await screen.findByRole("option", { name: /rahul sharma/i });
    await userEvent.selectOptions(managerSelect(), "8");
    expect(managerSelect().value).toBe("8");

    await userEvent.selectOptions(deptSelect(), "2");
    await screen.findByRole("option", { name: /sales head a/i });
    expect(managerSelect().value).toBe("");
    expect(nextButton()).toBeDisabled();
  });

  it("reports an empty department honestly and keeps Next disabled", async () => {
    hrApi.getDepartmentManagers.mockResolvedValue({ status: true, data: [] });
    await openWizard();

    await userEvent.selectOptions(deptSelect(), "2");

    await screen.findByText("No Department Manager is assigned to this department.");
    expect(managerSelect()).toBeDisabled();
    expect(nextButton()).toBeDisabled();
  });

  it("offers a retry when the manager lookup fails", async () => {
    hrApi.getDepartmentManagers.mockRejectedValueOnce(new Error("boom"));
    hrApi.getDepartmentManagers.mockResolvedValueOnce({ status: true, data: [RAHUL] });
    await openWizard();

    await userEvent.selectOptions(deptSelect(), "1");
    await screen.findByText(/unable to load department managers/i);
    expect(nextButton()).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(managerSelect().value).toBe("7"));
  });

  it("ignores a stale manager response after switching departments", async () => {
    const pending = {};
    hrApi.getDepartmentManagers.mockImplementation((deptId) =>
      new Promise((resolve) => { pending[deptId] = resolve; }));
    await openWizard();

    await userEvent.selectOptions(deptSelect(), "1");
    await userEvent.selectOptions(deptSelect(), "2");

    pending["2"]({ status: true, data: [SALES_A, SALES_B] });
    await screen.findByRole("option", { name: /sales head a/i });

    pending["1"]({ status: true, data: [RAHUL] });
    await waitFor(() => expect(hrApi.getDepartmentManagers).toHaveBeenCalledTimes(2));

    expect(screen.queryByRole("option", { name: /rahul sharma/i })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /sales head a/i })).toBeInTheDocument();
    expect(managerSelect().value).toBe("");
  });
});

describe("Step 2", () => {
  const reachStep2 = async () => {
    hrApi.getDepartmentManagers.mockResolvedValue({ status: true, data: [RAHUL] });
    await openWizard();
    await userEvent.selectOptions(deptSelect(), "1");
    await waitFor(() => expect(managerSelect().value).toBe("7"));
    await userEvent.click(nextButton());
    await screen.findByRole("textbox", { name: "Title" });
  };

  it("shows the requisition form with the chosen department and manager", async () => {
    await reachStep2();

    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("Rahul Sharma")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
  });

  it("Back returns to Step 1 and preserves the form", async () => {
    await reachStep2();

    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "Senior Engineer" } });
    await userEvent.click(screen.getByRole("button", { name: /back/i }));
    await waitFor(() => expect(deptSelect()).toBeInTheDocument());

    await waitFor(() => expect(managerSelect().value).toBe("7"));
    await userEvent.click(nextButton());
    expect(await screen.findByRole("textbox", { name: "Title" })).toHaveValue("Senior Engineer");
  });

  it("Save sends department_id and department_manager_id as numbers", async () => {
    hrApi.storeRequisition.mockResolvedValue({ status: true, message: "Requisition created" });
    await reachStep2();

    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "Senior Engineer" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(hrApi.storeRequisition).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Senior Engineer", department_id: 1, department_manager_id: 7 }),
      "t", "Bearer",
    ));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument());
    expect(hrApi.getRequisitions.mock.calls.length).toBeGreaterThan(1);
  });

  it("a failed save keeps the modal and draft intact", async () => {
    hrApi.storeRequisition.mockRejectedValue(new Error("The selected user is not an active manager of the selected department."));
    await reachStep2();

    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "Senior Engineer" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Senior Engineer");
  });

  it("Cancel with entered data asks before discarding", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    await reachStep2();

    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "Senior Engineer" } });
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Title" })).toBeInTheDocument();

    confirmSpy.mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument());
    confirmSpy.mockRestore();
  });

  it("reopening after a discard starts a fresh Step 1", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    await reachStep2();

    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "Senior Engineer" } });
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /new requisition/i }));
    expect(deptSelect().value).toBe("");
    expect(managerSelect().value).toBe("");
    expect(nextButton()).toBeDisabled();
    confirmSpy.mockRestore();
  });
});
