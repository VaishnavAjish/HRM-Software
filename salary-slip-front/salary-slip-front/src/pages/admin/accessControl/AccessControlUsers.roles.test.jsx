import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../../../utils/api", () => ({
  adminUserApi: {
    list: vi.fn(),
    get: vi.fn(),
    filterOptions: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    action: vi.fn(),
    bulk: vi.fn(),
    export: vi.fn(),
    auditLogs: vi.fn(),
  },
}));

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ user: { accessToken: "t", tokenType: "Bearer", rawRole: 0 } }),
}));

vi.mock("../../../hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true }),
}));

import { adminUserApi } from "../../../utils/api";
import AccessControlUsers from "./AccessControlUsers";

const ADMIN = { value: "role:26", label: "Admin", tier: 1, roleId: 26, code: "admin", selectable: true };
const EMP = { value: "role:27", label: "EMP", tier: 3, roleId: 27, code: "emp", selectable: true };
const HR = { value: "role:28", label: "HR Manager", tier: 3, roleId: 28, code: "hr_manager", selectable: true };

const ROW = {
  id: 7, name: "Asha Patel", empCode: "E-1001", email: "asha@test.local",
  status: "ACTIVE", roleLabel: "EMP", mobile: "9000000001",
};

/*
 * The regression these guard against is a single filtered role array shared by
 * both dialogs. Whichever rule such an array applies is wrong on one of the two
 * screens, and the failure is silent: Create quietly offers Employee, or Edit
 * quietly loses the ability to demote anyone back to one.
 */
beforeEach(() => {
  vi.clearAllMocks();

  adminUserApi.list.mockResolvedValue({
    data: [ROW],
    summary: {},
    meta: { page: 1, perPage: 25, total: 1, administrationReady: true },
  });

  adminUserApi.filterOptions.mockResolvedValue({
    data: {
      departments: [], designations: [], branches: [], units: [], companies: [
        { id: 1, code: "nidhi-impex", name: "Nidhi Impex" },
        { id: 2, code: "silver-star", name: "Silver Star" },
      ],
      roles: [], statuses: [], userTypes: [],
      unitOptions: [
        { id: 11, name: "Shreeji", companyId: 1 },
        { id: 12, name: "Ichapur", companyId: 1 },
        { id: 21, name: "Daduk", companyId: 2 },
        { id: 22, name: "Ichapur", companyId: 2 },
      ],
      userTypeOptions: [ADMIN, EMP, HR],
      userTypeOptionsByContext: {
        direct_create: [ADMIN, HR],
        edit_user: [ADMIN, EMP, HR],
      },
    },
  });

  adminUserApi.get.mockResolvedValue({
    data: {
      name: "Asha Patel", username: "asha", email: "asha@test.local", empCode: "E-1001",
      mobile: "9000000001", legacyRole: 3, companyIds: [2],
      roles: [{ id: 27, name: "EMP" }], directPermissions: [],
      employment: { unit: "Daduk", department: "Polish" },
    },
  });
});

const userTypeSelect = () => screen.getByRole("combobox", { name: /user type/i });

describe("AccessControlUsers user type dropdown", () => {
  it("omits Employee when creating a user", async () => {
    render(<AccessControlUsers />);

    await userEvent.click(await screen.findByRole("button", { name: /new user/i }));

    const select = await screen.findByRole("combobox", { name: /user type/i });
    const labels = within(select).getAllByRole("option").map((option) => option.textContent);

    expect(labels).toContain("Admin");
    expect(labels).toContain("HR Manager");
    expect(labels).not.toContain("EMP");
  });

  it("tells the operator where employee accounts come from instead", async () => {
    render(<AccessControlUsers />);

    await userEvent.click(await screen.findByRole("button", { name: /new user/i }));

    expect(
      await screen.findByText(/created from the Trial or Appointment form/i),
    ).toBeInTheDocument();
  });

  it("includes Employee when editing a user", async () => {
    render(<AccessControlUsers />);

    await userEvent.click(await screen.findByRole("button", { name: /actions/i }));
    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));

    await waitFor(() => expect(adminUserApi.get).toHaveBeenCalled());

    const labels = within(userTypeSelect()).getAllByRole("option").map((option) => option.textContent);

    expect(labels).toContain("EMP");
    expect(labels).toContain("Admin");
  });

  it("preselects the role the account already holds", async () => {
    render(<AccessControlUsers />);

    await userEvent.click(await screen.findByRole("button", { name: /actions/i }));
    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));

    await waitFor(() => expect(adminUserApi.get).toHaveBeenCalled());
    await waitFor(() => expect(userTypeSelect()).toHaveValue("role:27"));
  });

  it("sends the role id rather than a display name when promoting", async () => {
    adminUserApi.update.mockResolvedValue({});

    render(<AccessControlUsers />);

    await userEvent.click(await screen.findByRole("button", { name: /actions/i }));
    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
    await waitFor(() => expect(adminUserApi.get).toHaveBeenCalled());

    await userEvent.selectOptions(userTypeSelect(), "role:26");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(adminUserApi.update).toHaveBeenCalled());

    const [, payload] = adminUserApi.update.mock.calls[0];
    expect(payload.roleId).toBe(26);
  });

  it("preselects existing company membership and keeps it when only the role changes", async () => {
    adminUserApi.update.mockResolvedValue({});

    render(<AccessControlUsers />);

    await userEvent.click(await screen.findByRole("button", { name: /actions/i }));
    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
    await waitFor(() => expect(adminUserApi.get).toHaveBeenCalled());

    expect(await screen.findByText("Silver Star")).toBeInTheDocument();

    await userEvent.selectOptions(userTypeSelect(), "role:26");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(adminUserApi.update).toHaveBeenCalled());

    const [, payload] = adminUserApi.update.mock.calls[0];
    expect(payload.companyIds).toEqual([2]);
  });
});

describe("assign role permission summary", () => {
  /*
   * The Assign Role dialog used to list bare role names, so an administrator
   * picked blind — nothing said which pages a role allows until they opened the
   * Permission Matrix. Each role now carries the pages its grants resolve to,
   * and roles with no grants say so rather than implying access.
   */
  it("shows the pages each role allows from the permission matrix", async () => {
    adminUserApi.filterOptions.mockResolvedValue({
      data: {
        departments: [], designations: [], branches: [], units: [], companies: [],
        roles: [
          { id: 28, name: "HR Manager", code: "hr_manager", grantedCount: 3, pages: ["HR", "Organization"], more: 1 },
          { id: 27, name: "EMP", code: "emp", grantedCount: 0, pages: [], more: 0 },
        ],
        statuses: [], userTypes: [], unitOptions: [],
        userTypeOptions: [HR, EMP],
        userTypeOptionsByContext: { direct_create: [HR], edit_user: [HR, EMP] },
      },
    });

    render(<AccessControlUsers />);

    await userEvent.click(await screen.findByRole("button", { name: /actions/i }));
    await userEvent.click(await screen.findByRole("button", { name: /assign role/i }));

    expect(await screen.findByText("HR Manager")).toBeInTheDocument();
    expect(await screen.findByText(/HR · Organization/)).toBeInTheDocument();
    expect(await screen.findByText(/\+1 more/)).toBeInTheDocument();
    expect(await screen.findByText(/No permissions assigned yet/i)).toBeInTheDocument();
  });
});

describe("company multi-select", () => {
  it("lets more than one company be selected and submits ids", async () => {
    adminUserApi.create.mockResolvedValue({});

    render(<AccessControlUsers />);
    await userEvent.click(await screen.findByRole("button", { name: /new user/i }));

    await userEvent.type(await screen.findByLabelText(/full name/i), "Multi Company");
    await userEvent.type(screen.getByLabelText(/^email/i), "multi@test.local");
    await userEvent.type(screen.getByLabelText(/employee id/i), "E-9001");
    await userEvent.type(screen.getByLabelText(/^password/i), "secret1234");
    await userEvent.selectOptions(userTypeSelect(), "role:26");

    await userEvent.click(screen.getByRole("button", { name: "Company" }));
    await userEvent.click(await screen.findByRole("option", { name: "Nidhi Impex" }));
    // The panel stays open, which is the entire point of a multi-select.
    await userEvent.click(screen.getByRole("option", { name: "Silver Star" }));

    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(adminUserApi.create).toHaveBeenCalled());

    const [payload] = adminUserApi.create.mock.calls[0];
    expect(payload.companyIds).toEqual([1, 2]);
    expect(payload.roleId).toBe(26);
  });
});

describe("unit multi-select", () => {
  const openCreate = async () => {
    render(<AccessControlUsers />);
    await userEvent.click(await screen.findByRole("button", { name: /new user/i }));
  };

  it("is disabled until a company is chosen", async () => {
    await openCreate();

    const unit = await screen.findByRole("button", { name: "Unit" });

    expect(unit).toBeDisabled();
    expect(unit).toHaveTextContent(/select company first/i);
  });

  it("offers only units belonging to the selected companies, grouped by company", async () => {
    await openCreate();

    await userEvent.click(screen.getByRole("button", { name: "Company" }));
    await userEvent.click(await screen.findByRole("option", { name: "Nidhi Impex" }));
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("button", { name: "Unit" }));

    const group = await screen.findByRole("group", { name: "Nidhi Impex" });

    expect(within(group).getByRole("option", { name: "Shreeji" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Daduk" })).not.toBeInTheDocument();
    // "Ichapur" exists under both companies, so only the Nidhi one is offered.
    expect(screen.getAllByRole("option", { name: "Ichapur" })).toHaveLength(1);
  });

  it("drops a selected unit when its company is unticked", async () => {
    adminUserApi.create.mockResolvedValue({});

    await openCreate();

    await userEvent.click(screen.getByRole("button", { name: "Company" }));
    await userEvent.click(await screen.findByRole("option", { name: "Nidhi Impex" }));
    await userEvent.click(screen.getByRole("option", { name: "Silver Star" }));
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("button", { name: "Unit" }));
    await userEvent.click(await screen.findByRole("option", { name: "Shreeji" }));
    await userEvent.click(screen.getByRole("option", { name: "Daduk" }));
    await userEvent.keyboard("{Escape}");

    // Silver Star goes away, and Daduk must go with it.
    await userEvent.click(screen.getByRole("button", { name: "Company" }));
    await userEvent.click(await screen.findByRole("option", { name: "Silver Star" }));
    await userEvent.keyboard("{Escape}");

    await userEvent.type(await screen.findByLabelText(/full name/i), "Unit Pruned");
    await userEvent.type(screen.getByLabelText(/^email/i), "pruned@test.local");
    await userEvent.type(screen.getByLabelText(/employee id/i), "E-9002");
    await userEvent.type(screen.getByLabelText(/^password/i), "secret1234");
    await userEvent.selectOptions(userTypeSelect(), "role:26");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(adminUserApi.create).toHaveBeenCalled());

    const [payload] = adminUserApi.create.mock.calls[0];
    expect(payload.companyIds).toEqual([1]);
    expect(payload.unitIds).toEqual([11]);
  });

  /*
   * The primary unit is asked for, never derived.
   *
   * It was briefly the alphabetically first selection, which let the alphabet
   * decide real employment data — users.unit is what attendance, payroll and
   * every unit filter read.
   */
  it("asks which unit is primary once more than one is chosen", async () => {
    await openCreate();

    await userEvent.click(screen.getByRole("button", { name: "Company" }));
    await userEvent.click(await screen.findByRole("option", { name: "Nidhi Impex" }));
    await userEvent.keyboard("{Escape}");

    // One unit needs no question — it is its own primary.
    await userEvent.click(screen.getByRole("button", { name: "Unit" }));
    await userEvent.click(await screen.findByRole("option", { name: "Shreeji" }));

    expect(screen.queryByLabelText(/primary unit/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("option", { name: "Ichapur" }));
    await userEvent.keyboard("{Escape}");

    expect(await screen.findByLabelText(/primary unit/i)).toBeInTheDocument();
  });

  it("keeps the unit that was already primary and submits the operator's choice", async () => {
    adminUserApi.create.mockResolvedValue({});

    await openCreate();

    await userEvent.type(await screen.findByLabelText(/full name/i), "Two Units");
    await userEvent.type(screen.getByLabelText(/^email/i), "two@test.local");
    await userEvent.type(screen.getByLabelText(/employee id/i), "E-9003");
    await userEvent.type(screen.getByLabelText(/^password/i), "secret1234");
    await userEvent.selectOptions(userTypeSelect(), "role:26");

    await userEvent.click(screen.getByRole("button", { name: "Company" }));
    await userEvent.click(await screen.findByRole("option", { name: "Nidhi Impex" }));
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("button", { name: "Unit" }));
    await userEvent.click(await screen.findByRole("option", { name: "Shreeji" }));
    await userEvent.click(screen.getByRole("option", { name: "Ichapur" }));
    await userEvent.keyboard("{Escape}");

    // Adding a second unit does not silently move the home unit: the one that
    // was already primary stays selected, and the field is now visible so the
    // operator can say otherwise.
    const primary = await screen.findByLabelText(/primary unit/i);
    expect(primary).toHaveValue("11");

    await userEvent.selectOptions(primary, "12");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(adminUserApi.create).toHaveBeenCalled());

    const [payload] = adminUserApi.create.mock.calls[0];
    expect(payload.unitIds).toEqual([11, 12]);
    expect(payload.primaryUnitId).toBe(12);
  });

  it("blocks saving an existing multi-unit account whose primary is unresolved", async () => {
    // A legacy account whose users.unit matches no unit record loads with
    // memberships and no primary. The server refuses that save, so the button
    // does too rather than letting the request fail.
    adminUserApi.get.mockResolvedValue({
      data: {
        name: "Legacy", email: "legacy@test.local", empCode: "E-1002",
        legacyRole: 3, companyIds: [1], unitIds: [11, 12], primaryUnitId: null,
        roles: [{ id: 27, name: "EMP" }], directPermissions: [], employment: {},
      },
    });

    render(<AccessControlUsers />);

    await userEvent.click(await screen.findByRole("button", { name: /actions/i }));
    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
    await waitFor(() => expect(adminUserApi.get).toHaveBeenCalled());

    expect(await screen.findByLabelText(/primary unit/i)).toHaveValue("");
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });
});
