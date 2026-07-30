import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const AADHAAR_KEY = "appointments.view_full_aadhaar";
const PRINT_KEY = "appointments.print_full_aadhaar";
const PDF_KEY = "appointments.export_full_aadhaar_pdf";

/**
 * Six sensitive permissions share this section now, so labels like "View Full
 * Aadhaar Number" and "Not granted" appear more than once. Every assertion is
 * scoped to one row, keyed by the internal permission key, which is unique.
 */
const row = (key) => within(screen.getByTestId(`sensitive-${key}`));

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

    expect(row(AADHAAR_KEY).getByText("View Full Aadhaar Number")).toBeInTheDocument();
    expect(row(AADHAAR_KEY).getByText(AADHAAR_KEY)).toBeInTheDocument();
    expect(row(AADHAAR_KEY).getByText("Appointments")).toBeInTheDocument();
    expect(screen.getByText("Sensitive Data Permissions")).toBeInTheDocument();
  });

  it("flags it as high risk and says reveals are audited", async () => {
    await openAdmin();

    expect(screen.getByText("High Risk")).toBeInTheDocument();
    expect(row(AADHAAR_KEY).getByText(/audited/i)).toBeInTheDocument();
  });

  it("shows it as not granted when no row exists", async () => {
    await openAdmin();

    // Deny-by-default, unlike page access.
    expect(row(AADHAAR_KEY).getByText("Not granted")).toBeInTheDocument();
    expect(row(AADHAAR_KEY).getByRole("checkbox")).not.toBeChecked();
  });

  it("asks for confirmation before granting", async () => {
    await openAdmin();

    await userEvent.click(row(AADHAAR_KEY).getByRole("checkbox"));

    expect(
      await screen.findByText(/Grant access to full Aadhaar numbers\?/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/legitimate business need/i)).toBeInTheDocument();
    // Nothing is written until the administrator confirms.
    expect(rbacApi.storeDimension).not.toHaveBeenCalled();
  });

  it("grants nothing when the confirmation is cancelled", async () => {
    await openAdmin();

    await userEvent.click(row(AADHAAR_KEY).getByRole("checkbox"));
    await userEvent.click(await screen.findByRole("button", { name: /^cancel$/i }));

    expect(rbacApi.storeDimension).not.toHaveBeenCalled();
    expect(screen.queryByText(/Grant access to full Aadhaar numbers\?/i)).toBeNull();
  });

  it("writes the grant once confirmed", async () => {
    await openAdmin();

    await userEvent.click(row(AADHAAR_KEY).getByRole("checkbox"));
    await userEvent.click(await screen.findByRole("button", { name: /grant permission/i }));

    await waitFor(() => expect(rbacApi.storeDimension).toHaveBeenCalledTimes(1));

    const [dimension, payload] = rbacApi.storeDimension.mock.calls[0];
    expect(dimension).toBe("page");
    expect(payload).toMatchObject({ role_id: 42, key_name: AADHAAR_KEY, value: "view_only" });
    await waitFor(() => expect(row(AADHAAR_KEY).getByText("Granted")).toBeInTheDocument());
  });

  it("revokes immediately without a confirmation", async () => {
    dimensionRows = [{ id: 5, key_name: AADHAAR_KEY, value: "view_only", dimension: "page" }];

    await openAdmin();
    expect(row(AADHAAR_KEY).getByText("Granted")).toBeInTheDocument();

    await userEvent.click(row(AADHAAR_KEY).getByRole("checkbox"));

    await waitFor(() => expect(rbacApi.storeDimension).toHaveBeenCalledTimes(1));
    expect(rbacApi.storeDimension.mock.calls[0][1]).toMatchObject({
      key_name: AADHAAR_KEY,
      value: "no_access",
    });
  });

  it("reflects an existing no_access row as not granted", async () => {
    dimensionRows = [{ id: 5, key_name: AADHAAR_KEY, value: "no_access", dimension: "page" }];

    await openAdmin();

    expect(row(AADHAAR_KEY).getByText("Not granted")).toBeInTheDocument();
  });

  /**
   * Print and PDF are separate grants, and the matrix has to make that
   * separable — a single "full Aadhaar" switch would mean anyone trusted to read
   * a number on screen could also walk out with a copy of it.
   */
  it("offers print and PDF export as their own grants", async () => {
    await openAdmin();

    expect(row(PRINT_KEY).getByText("Print Full Aadhaar Document")).toBeInTheDocument();
    expect(row(PDF_KEY).getByText("Download Confidential Aadhaar PDF")).toBeInTheDocument();

    // And says why they are heavier than a screen view.
    expect(row(PRINT_KEY).getByText(/outside application access control/i)).toBeInTheDocument();
    expect(row(PDF_KEY).getByText(/cannot be recalled/i)).toBeInTheDocument();
  });

  it("granting the view permission leaves print and PDF ungranted", async () => {
    dimensionRows = [{ id: 5, key_name: AADHAAR_KEY, value: "view_only", dimension: "page" }];

    await openAdmin();

    expect(row(AADHAAR_KEY).getByText("Granted")).toBeInTheDocument();
    expect(row(PRINT_KEY).getByText("Not granted")).toBeInTheDocument();
    expect(row(PDF_KEY).getByText("Not granted")).toBeInTheDocument();
  });

  it("grants the export permission under its own key", async () => {
    await openAdmin();

    await userEvent.click(row(PDF_KEY).getByRole("checkbox"));
    await userEvent.click(await screen.findByRole("button", { name: /grant permission/i }));

    await waitFor(() => expect(rbacApi.storeDimension).toHaveBeenCalledTimes(1));
    expect(rbacApi.storeDimension.mock.calls[0][1]).toMatchObject({
      key_name: PDF_KEY,
      value: "view_only",
    });
  });

  it("shows the employee equivalents alongside the appointment ones", async () => {
    await openAdmin();

    // Previously enforced but absent from this screen, so it could only be
    // granted by someone who already knew the key.
    expect(row("employees.view_full_aadhaar").getByText(/View Full Aadhaar Number/)).toBeInTheDocument();
    expect(row("employees.print_full_aadhaar")).toBeTruthy();
    expect(row("employees.export_full_aadhaar_pdf")).toBeTruthy();
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
