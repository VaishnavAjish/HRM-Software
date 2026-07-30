import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const AADHAAR_KEY = "appointments.view_full_aadhaar";

vi.mock("../../../utils/api", () => ({
  roleApi: { getRoles: vi.fn(), storeRole: vi.fn() },
  rbacApi: { getUserRoles: vi.fn(), getDimension: vi.fn(), storeDimension: vi.fn() },
  salaryApi: { deleteEmployee: vi.fn() },
}));

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ user: { accessToken: "t", tokenType: "Bearer", rawRole: 0 } }),
}));

vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import PermissionMatrix from "./PermissionMatrix";
import { roleApi, rbacApi } from "../../../utils/api";

const hrAdmin = { id: 7, name: "Nisha HR", email: "nisha@example.com", role: 1 };

/** Existing dimension rows returned for the selected admin's role. */
let dimensionRows = [];

const openAdmin = async () => {
  render(<PermissionMatrix />);
  const [manage] = await screen.findAllByRole("button", { name: /manage/i });
  await userEvent.click(manage);
  await waitFor(() => expect(rbacApi.getDimension).toHaveBeenCalled());
};

beforeEach(() => {
  vi.clearAllMocks();
  dimensionRows = [];
  rbacApi.getUserRoles.mockResolvedValue({ status: true, data: [hrAdmin] });
  roleApi.getRoles.mockResolvedValue({
    status: true,
    data: [{ id: 42, name: "User_7_Permissions" }],
  });
  // A user with no permission role yet gets one created on first open.
  roleApi.storeRole.mockImplementation(async ({ name }) => ({
    status: true,
    data: { id: 99, name },
  }));
  rbacApi.getDimension.mockImplementation(async () => ({ status: true, data: dimensionRows }));
  rbacApi.storeDimension.mockImplementation(async (_dim, payload) => ({
    status: true,
    data: { ...payload, dimension: "page" },
  }));
});

/**
 * The reveal permission is enforced from permission_dimensions, so it has to be
 * grantable here. Page access defaults to read_write when no row exists — this
 * one must default the other way, or the matrix would claim a permission is
 * granted that the server refuses.
 */
describe("PermissionMatrix — full Aadhaar permission", () => {
  it("lists the permission by name, module and internal key", async () => {
    await openAdmin();

    expect(screen.getByText("View Full Aadhaar Number")).toBeInTheDocument();
    expect(screen.getByText(AADHAAR_KEY)).toBeInTheDocument();
    expect(screen.getByText("Sensitive Data Permissions")).toBeInTheDocument();
  });

  it("flags it as high risk and says reveals are audited", async () => {
    await openAdmin();

    expect(screen.getByText("High Risk")).toBeInTheDocument();
    expect(screen.getByText(/audited/i)).toBeInTheDocument();
  });

  it("shows it as not granted when no row exists", async () => {
    await openAdmin();

    // Deny-by-default, unlike page access.
    expect(screen.getByText("Not granted")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /not granted/i })).not.toBeChecked();
  });

  it("asks for confirmation before granting", async () => {
    await openAdmin();

    await userEvent.click(screen.getByRole("checkbox", { name: /not granted/i }));

    expect(
      await screen.findByText(/Grant access to full Aadhaar numbers\?/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/legitimate business need/i)).toBeInTheDocument();
    // Nothing is written until the administrator confirms.
    expect(rbacApi.storeDimension).not.toHaveBeenCalled();
  });

  it("grants nothing when the confirmation is cancelled", async () => {
    await openAdmin();

    await userEvent.click(screen.getByRole("checkbox", { name: /not granted/i }));
    await userEvent.click(await screen.findByRole("button", { name: /^cancel$/i }));

    expect(rbacApi.storeDimension).not.toHaveBeenCalled();
    expect(screen.queryByText(/Grant access to full Aadhaar numbers\?/i)).toBeNull();
  });

  it("writes the grant once confirmed", async () => {
    await openAdmin();

    await userEvent.click(screen.getByRole("checkbox", { name: /not granted/i }));
    await userEvent.click(await screen.findByRole("button", { name: /grant permission/i }));

    await waitFor(() => expect(rbacApi.storeDimension).toHaveBeenCalledTimes(1));

    const [dimension, payload] = rbacApi.storeDimension.mock.calls[0];
    expect(dimension).toBe("page");
    expect(payload).toMatchObject({ role_id: 42, key_name: AADHAAR_KEY, value: "view_only" });
    expect(await screen.findByText("Granted")).toBeInTheDocument();
  });

  it("revokes immediately without a confirmation", async () => {
    dimensionRows = [{ id: 5, key_name: AADHAAR_KEY, value: "view_only", dimension: "page" }];

    await openAdmin();
    expect(screen.getByText("Granted")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /granted/i }));

    await waitFor(() => expect(rbacApi.storeDimension).toHaveBeenCalledTimes(1));
    expect(rbacApi.storeDimension.mock.calls[0][1]).toMatchObject({
      key_name: AADHAAR_KEY,
      value: "no_access",
    });
  });

  it("reflects an existing no_access row as not granted", async () => {
    dimensionRows = [{ id: 5, key_name: AADHAAR_KEY, value: "no_access", dimension: "page" }];

    await openAdmin();

    expect(screen.getByText("Not granted")).toBeInTheDocument();
  });

  it("does not offer it for employee or agent accounts", async () => {
    rbacApi.getUserRoles.mockResolvedValue({
      status: true,
      data: [{ id: 9, name: "Ravi Employee", email: "ravi@example.com", role: 3 }],
    });

    render(<PermissionMatrix />);
    const [manage] = await screen.findAllByRole("button", { name: /manage/i });
    await userEvent.click(manage);
    await waitFor(() => expect(rbacApi.getDimension).toHaveBeenCalled());

    expect(screen.queryByText("Sensitive Data Permissions")).toBeNull();
    expect(screen.queryByText("View Full Aadhaar Number")).toBeNull();
  });
});
