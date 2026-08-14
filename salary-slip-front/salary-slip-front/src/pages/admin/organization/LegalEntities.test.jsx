import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../../../utils/api", () => ({
  companyUnitApi: { companies: vi.fn() },
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
    legalEntities: vi.fn(),
    createLegalEntity: vi.fn(),
    updateLegalEntity: vi.fn(),
    setLegalEntityStatus: vi.fn(),
    deleteLegalEntity: vi.fn(),
  },
}));

import { companyUnitApi } from "../../../utils/api";
import { organizationApi } from "../../../features/organization/services/organizationApi";
import LegalEntities from "./LegalEntities";

const NIDHI = { id: 1, name: "Nidhi Impex", code: "nidhi-impex", isActive: true };
const SILVER = { id: 2, name: "Silver Star", code: "silver-star", isActive: true };

const EMPLOYER = {
  id: 11,
  companyId: 1,
  companyName: "Nidhi Impex",
  code: "nidhi-legal",
  name: "Nidhi Employers Pvt Ltd",
  legalName: "Nidhi Employers Private Limited",
  countryCode: "IN",
  currency: "INR",
  isPrimary: true,
  isActive: true,
};

const ALL_PERMISSIONS = [
  "org.legal_entity.read", "org.legal_entity.create", "org.legal_entity.update",
  "org.legal_entity.status", "org.legal_entity.delete",
];

beforeEach(() => {
  vi.clearAllMocks();
  allowed = new Set(ALL_PERMISSIONS);

  companyUnitApi.companies.mockResolvedValue({ data: [NIDHI, SILVER] });
  organizationApi.legalEntities.mockResolvedValue({ data: [EMPLOYER] });
});

const rowFor = async (name) => {
  const cell = await screen.findByText(name);
  return cell.closest("tr");
};

describe("LegalEntities", () => {
  it("lists entities with their company, currency and badges", async () => {
    render(<LegalEntities />);

    const row = await rowFor("Nidhi Employers Pvt Ltd");

    expect(within(row).getByText("nidhi-legal")).toBeInTheDocument();
    expect(within(row).getByText("Nidhi Impex")).toBeInTheDocument();
    expect(within(row).getByText("INR")).toBeInTheDocument();
    expect(within(row).getByText("Primary")).toBeInTheDocument();
    expect(within(row).getByText("Active")).toBeInTheDocument();
  });

  it("locks the company selector when the account sees a single company", async () => {
    companyUnitApi.companies.mockResolvedValue({ data: [NIDHI] });

    render(<LegalEntities />);
    await rowFor("Nidhi Employers Pvt Ltd");

    await userEvent.click(screen.getByRole("button", { name: /add legal entity/i }));
    expect(await screen.findByLabelText(/company \*/i)).toBeDisabled();
    expect(screen.getByText(/scoped to this company/i)).toBeInTheDocument();
  });

  it("creates an entity with the camelCase payload the backend expects", async () => {
    organizationApi.createLegalEntity.mockResolvedValue({});

    render(<LegalEntities />);
    await rowFor("Nidhi Employers Pvt Ltd");

    await userEvent.click(screen.getByRole("button", { name: /add legal entity/i }));
    await userEvent.selectOptions(await screen.findByLabelText(/company \*/i), "1");
    await userEvent.type(screen.getByLabelText(/entity name/i), "Silver Legal");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(organizationApi.createLegalEntity).toHaveBeenCalled());
    expect(organizationApi.createLegalEntity.mock.calls[0][0]).toEqual({
      companyId: 1,
      code: "silver-legal",
      name: "Silver Legal",
      legalName: "",
      registrationNumber: "",
      countryCode: "IN",
      taxId: "",
      currency: "INR",
      fiscalYearStart: "04-01",
      primaryAddress: "",
      contactEmail: "",
      contactPhone: "",
      isPrimary: false,
    });
  });

  it("toggles status through the status route", async () => {
    organizationApi.setLegalEntityStatus.mockResolvedValue({});

    render(<LegalEntities />);
    const row = await rowFor("Nidhi Employers Pvt Ltd");

    await userEvent.click(within(row).getByRole("button", { name: /deactivate nidhi employers pvt ltd/i }));

    await waitFor(() => expect(organizationApi.setLegalEntityStatus).toHaveBeenCalled());
    expect(organizationApi.setLegalEntityStatus.mock.calls[0]).toEqual([11, false, "t", "Bearer"]);
  });

  it("disables delete for the primary employing entity", async () => {
    render(<LegalEntities />);

    const row = await rowFor("Nidhi Employers Pvt Ltd");
    expect(within(row).getByRole("button", { name: /delete nidhi employers pvt ltd/i })).toBeDisabled();
  });

  it("hides every control the actor lacks the permission for", async () => {
    allowed = new Set(["org.legal_entity.read"]);

    render(<LegalEntities />);
    await rowFor("Nidhi Employers Pvt Ltd");

    expect(screen.queryByRole("button", { name: /add legal entity/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit nidhi employers pvt ltd/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete nidhi employers pvt ltd/i })).not.toBeInTheDocument();
  });
});