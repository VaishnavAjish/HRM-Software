import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../../../utils/api", () => ({
  companyUnitApi: {
    companies: vi.fn(),
    createCompany: vi.fn(),
    updateCompany: vi.fn(),
    setCompanyStatus: vi.fn(),
    deleteCompany: vi.fn(),
    units: vi.fn(),
    createUnit: vi.fn(),
    updateUnit: vi.fn(),
    setUnitStatus: vi.fn(),
    deleteUnit: vi.fn(),
    legacyUnits: vi.fn(),
    adoptLegacyUnit: vi.fn(),
  },
  departmentApi: {
    departments: vi.fn(),
    departmentManagers: vi.fn(),
    eligibleUsers: vi.fn(),
    createDepartment: vi.fn(),
    updateDepartment: vi.fn(),
    deleteDepartment: vi.fn(),
    assignManager: vi.fn(),
    removeManager: vi.fn(),
  },
}));

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ user: { accessToken: "t", tokenType: "Bearer", rawRole: 0 } }),
}));

let allowed = new Set();

vi.mock("../../../hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: (code) => allowed.has(code) }),
}));

import { companyUnitApi, departmentApi } from "../../../utils/api";
import CompanyUnits from "./CompanyUnits";

const NIDHI = {
  id: 1, name: "Nidhi Impex", code: "nidhi-impex", isActive: true,
  units: 2, assignedUsers: 9, legacyUsers: 9, codeLocked: true, createdAt: "2026-08-11",
};

const DISPOSABLE = {
  id: 3, name: "Disposable", code: "disposable", isActive: true,
  units: 0, assignedUsers: 0, legacyUsers: 0, codeLocked: false, createdAt: "2026-08-11",
};

const DADUK = {
  id: 21, name: "Daduk", companyId: 2, companyName: "Silver Star", isActive: true,
  assignedUsers: 0, legacyUsers: 333, companyLocked: true, createdAt: "2026-08-11",
};

const ALL_PERMISSIONS = [
  "admin.company.read", "admin.company.create", "admin.company.update",
  "admin.company.status", "admin.company.delete",
  "admin.unit.read", "admin.unit.create", "admin.unit.update",
  "admin.unit.status", "admin.unit.delete",
];

beforeEach(() => {
  vi.clearAllMocks();
  allowed = new Set(ALL_PERMISSIONS);

  companyUnitApi.companies.mockResolvedValue({ data: [NIDHI, DISPOSABLE] });
  companyUnitApi.units.mockResolvedValue({ data: [DADUK] });
  companyUnitApi.legacyUnits.mockResolvedValue({
    data: [{ name: "Shreeji", companyCode: "silver-star", companyId: 2, users: 1, hasUnitRecord: false }],
  });
  departmentApi.departments.mockResolvedValue({ data: [] });
  departmentApi.departmentManagers.mockResolvedValue({ data: [] });
  departmentApi.eligibleUsers.mockResolvedValue({ data: [] });
});

const rowFor = async (name) => {
  const cell = await screen.findByText(name);
  return cell.closest("tr");
};

describe("Companies tab", () => {
  it("lists companies with their code and usage", async () => {
    render(<CompanyUnits />);

    const row = await rowFor("Nidhi Impex");

    expect(within(row).getByText("nidhi-impex")).toBeInTheDocument();
    expect(within(row).getByText("Active")).toBeInTheDocument();
  });

  it("derives the code from the name when creating, so a comma can never be typed in", async () => {
    companyUnitApi.createCompany.mockResolvedValue({});

    render(<CompanyUnits />);
    await userEvent.click(await screen.findByRole("button", { name: /add company/i }));

    await userEvent.type(screen.getByLabelText(/company name/i), "Test Company");

    expect(screen.getByLabelText(/company code/i)).toHaveValue("test-company");

    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(companyUnitApi.createCompany).toHaveBeenCalled());
    expect(companyUnitApi.createCompany.mock.calls[0][0]).toEqual({
      name: "Test Company", code: "test-company",
    });
  });

  it("locks the code of a company anything depends on, and says why", async () => {
    render(<CompanyUnits />);

    const row = await rowFor("Nidhi Impex");
    await userEvent.click(within(row).getByRole("button", { name: /edit nidhi impex/i }));

    expect(await screen.findByLabelText(/company code/i)).toBeDisabled();
    expect(screen.getByText(/users or units already depend on it/i)).toBeInTheDocument();
    // The name is still editable — only the code is load-bearing.
    expect(screen.getByLabelText(/company name/i)).not.toBeDisabled();
  });

  it("disables delete for a company in use and enables it for one that is not", async () => {
    render(<CompanyUnits />);

    const inUse = await rowFor("Nidhi Impex");
    const free = await rowFor("Disposable");

    expect(within(inUse).getByRole("button", { name: /delete nidhi impex/i })).toBeDisabled();
    expect(within(free).getByRole("button", { name: /delete disposable/i })).toBeEnabled();
  });

  it("hides every control the actor lacks the permission for", async () => {
    allowed = new Set(["admin.company.read", "admin.unit.read"]);

    render(<CompanyUnits />);
    await rowFor("Nidhi Impex");

    expect(screen.queryByRole("button", { name: /add company/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit nidhi impex/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete nidhi impex/i })).not.toBeInTheDocument();
  });
});

describe("Units tab", () => {
  const openUnits = async () => {
    render(<CompanyUnits />);
    await userEvent.click(await screen.findByRole("button", { name: "Units" }));
  };

  it("shows the parent company and separates canonical from legacy headcount", async () => {
    await openUnits();

    const row = await rowFor("Daduk");

    expect(within(row).getByText("Silver Star")).toBeInTheDocument();
    // 0 assigned, 333 legacy — the migration is visibly outstanding rather than
    // collapsed into one misleading number.
    expect(within(row).getByText(/\+333 legacy/)).toBeInTheDocument();
  });

  it("blocks deleting and reparenting a unit people are assigned to", async () => {
    await openUnits();

    const row = await rowFor("Daduk");

    expect(within(row).getByRole("button", { name: /delete daduk/i })).toBeDisabled();

    await userEvent.click(within(row).getByRole("button", { name: /edit daduk/i }));

    expect(await screen.findByLabelText(/company \*/i)).toBeDisabled();
    expect(screen.getByText(/cannot be moved while users are assigned/i)).toBeInTheDocument();
  });

  it("offers legacy unit names for adoption without guessing their company", async () => {
    companyUnitApi.adoptLegacyUnit.mockResolvedValue({ data: { linked: 1 } });

    await openUnits();

    expect(await screen.findByText(/unmapped legacy units/i)).toBeInTheDocument();

    const select = screen.getByRole("combobox", { name: /company for shreeji/i });
    const adopt = screen.getByRole("button", { name: /adopt/i });

    // Nothing can be adopted until an administrator names the owner.
    expect(adopt).toBeDisabled();

    await userEvent.selectOptions(select, "1");
    await userEvent.click(adopt);

    await waitFor(() => expect(companyUnitApi.adoptLegacyUnit).toHaveBeenCalled());
    expect(companyUnitApi.adoptLegacyUnit.mock.calls[0][0]).toEqual({ name: "Shreeji", companyId: 1 });
  });

  it("creates a unit against a company id, never a name", async () => {
    companyUnitApi.createUnit.mockResolvedValue({});

    await openUnits();
    await userEvent.click(screen.getByRole("button", { name: /add unit/i }));

    await userEvent.selectOptions(await screen.findByLabelText(/company \*/i), "1");
    await userEvent.type(screen.getByLabelText(/unit name/i), "New Wing");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(companyUnitApi.createUnit).toHaveBeenCalled());
    expect(companyUnitApi.createUnit.mock.calls[0][0]).toEqual({ name: "New Wing", companyId: 1 });
  });
});
