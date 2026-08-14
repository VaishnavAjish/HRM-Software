import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../../../utils/api", () => ({
  companyUnitApi: { companies: vi.fn() },
  adminUserApi: { list: vi.fn() },
}));

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ user: { accessToken: "t", tokenType: "Bearer", rawRole: 0 } }),
}));

let allowed = new Set();

vi.mock("../../../hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: (code) => allowed.has(code) }),
}));

vi.mock("../../../features/organization/services/organizationApi", () => ({
  organizationApi: {
    locations: vi.fn(),
    createLocation: vi.fn(),
    updateLocation: vi.fn(),
    setLocationStatus: vi.fn(),
    deleteLocation: vi.fn(),
    locationMembers: vi.fn(),
    assignLocationMembers: vi.fn(),
    removeLocationMember: vi.fn(),
  },
}));

import { adminUserApi, companyUnitApi } from "../../../utils/api";
import { organizationApi } from "../../../features/organization/services/organizationApi";
import Locations from "./Locations";

const NIDHI = { id: 1, name: "Nidhi Impex", code: "nidhi-impex", isActive: true };
const SILVER = { id: 2, name: "Silver Star", code: "silver-star", isActive: true };

const HQ = {
  id: 4,
  companyId: 1,
  companyName: "Nidhi Impex",
  code: "hq",
  name: "Head Office",
  kind: "office",
  parentId: null,
  parentName: null,
  city: "Mumbai",
  isActive: true,
  memberCount: 5,
  hasChildren: true,
};

const BRANCH = {
  id: 7,
  companyId: 1,
  companyName: "Nidhi Impex",
  code: "pune-branch",
  name: "Pune Branch",
  kind: "branch",
  parentId: 4,
  parentName: "Head Office",
  city: "Pune",
  isActive: true,
  memberCount: 0,
  hasChildren: false,
};

const MEMBER = { userId: 21, name: "Asha Patel", empCode: "E-1001", email: "asha@test.local" };

const ALL_PERMISSIONS = [
  "org.location.read", "org.location.create", "org.location.update",
  "org.location.status", "org.location.delete",
];

beforeEach(() => {
  vi.clearAllMocks();
  allowed = new Set(ALL_PERMISSIONS);

  companyUnitApi.companies.mockResolvedValue({ data: [NIDHI, SILVER] });
  adminUserApi.list.mockResolvedValue({ data: [{ id: 21, name: "Asha Patel", empCode: "E-1001", email: "asha@test.local" }] });
  organizationApi.locations.mockResolvedValue({ data: [HQ, BRANCH] });
  organizationApi.locationMembers.mockResolvedValue({ data: [MEMBER] });
});

const rowFor = async (name) => {
  const cell = await screen.findByText(name);
  return cell.closest("tr");
};

describe("Locations", () => {
  it("lists locations with kind, parent and member count", async () => {
    render(<Locations />);

    const row = await rowFor("Pune Branch");

    expect(within(row).getByText("branch")).toBeInTheDocument();
    expect(within(row).getByText("Head Office")).toBeInTheDocument();
    expect(within(row).getByText("Pune")).toBeInTheDocument();
    expect(within(row).getByText("Active")).toBeInTheDocument();
  });

  it("creates a location with the camelCase payload, parent as an id or null", async () => {
    organizationApi.createLocation.mockResolvedValue({});

    render(<Locations />);
    await rowFor("Pune Branch");

    await userEvent.click(screen.getByRole("button", { name: /add location/i }));
    await userEvent.selectOptions(await screen.findByLabelText(/company \*/i), "1");
    await userEvent.type(screen.getByLabelText(/location name/i), "Nagpur Depot");
    await userEvent.selectOptions(screen.getByLabelText(/parent location/i), "4");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(organizationApi.createLocation).toHaveBeenCalled());
    const payload = organizationApi.createLocation.mock.calls[0][0];
    expect(payload.name).toBe("Nagpur Depot");
    expect(payload.parentId).toBe(4);
    expect(payload.companyId).toBe(1);
    expect(payload.kind).toBe("branch");
  });

  it("excludes the location itself from its own parent options on edit", async () => {
    render(<Locations />);
    await rowFor("Pune Branch");

    await userEvent.click(screen.getByRole("button", { name: /edit pune branch/i }));

    const parentSelect = await screen.findByLabelText(/parent location/i);
    const options = within(parentSelect).getAllByRole("option").map((option) => option.textContent);
    expect(options).toContain("Head Office");
    expect(options).not.toContain("— Pune Branch");
  });

  it("toggles status through the status route", async () => {
    organizationApi.setLocationStatus.mockResolvedValue({});

    render(<Locations />);
    const row = await rowFor("Pune Branch");

    await userEvent.click(within(row).getByRole("button", { name: /deactivate pune branch/i }));

    await waitFor(() => expect(organizationApi.setLocationStatus).toHaveBeenCalled());
    expect(organizationApi.setLocationStatus.mock.calls[0]).toEqual([7, false, "t", "Bearer"]);
  });

  it("disables delete for a location with sub-locations or members", async () => {
    render(<Locations />);
    await rowFor("Pune Branch");

    expect(screen.getByRole("button", { name: /delete head office/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /delete pune branch/i })).toBeEnabled();
  });

  it("hides every control the actor lacks the permission for", async () => {
    allowed = new Set(["org.location.read"]);

    render(<Locations />);
    await rowFor("Pune Branch");

    expect(screen.queryByRole("button", { name: /add location/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit pune branch/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete pune branch/i })).not.toBeInTheDocument();
  });
});