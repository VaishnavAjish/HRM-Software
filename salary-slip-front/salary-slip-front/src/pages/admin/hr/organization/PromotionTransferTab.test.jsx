import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../context/AuthContext", () => ({
  useAuth: () => ({ user: { accessToken: "token", tokenType: "Bearer" } }),
}));

const authState = vi.hoisted(() => ({
  allowed: new Set(["org.change.create", "org.change.submit", "org.change.approve", "org.change.reject", "org.change.apply"]),
}));

vi.mock("../../../../hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: (code) => authState.allowed.has(code) }),
}));

vi.mock("../../../../components/authorization/UserPicker", () => ({
  default: ({ label, value, onChange }) => (
    <div>
      <label htmlFor={label}>{label}</label>
      <input id={label} aria-label={label} value={value || ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  ),
}));

const apiState = vi.hoisted(() => ({ changes: [] }));

vi.mock("../../../../features/organization/services/organizationApi", () => ({
  organizationApi: {
    orgChanges: vi.fn(() => Promise.resolve({ data: apiState.changes })),
    orgUnits: vi.fn(() => Promise.resolve({ data: [{ id: 1, name: "Marketing" }] })),
    orgUnitPositions: vi.fn(() => Promise.resolve({ data: [{ id: 10, title: "Marketing Lead" }] })),
    orgUnitAssignments: vi.fn(() => Promise.resolve({ data: [] })),
    locations: vi.fn(() => Promise.resolve({ data: [] })),
    financialOrganizations: vi.fn(() => Promise.resolve({ data: [] })),
    createPromotionTransfer: vi.fn(() => Promise.resolve({ data: { id: 1 } })),
    submitOrgChange: vi.fn(),
    approveOrgChange: vi.fn(),
    rejectOrgChange: vi.fn(),
    applyOrgChange: vi.fn(),
    orgChangeItems: vi.fn(() => Promise.resolve({ data: [] })),
  },
}));

vi.mock("../../../../features/workforce/services/workforceApi", () => ({
  workforceApi: {
    designation: { list: vi.fn(() => Promise.resolve({ data: [{ id: 5, title: "Marketing Lead" }] })) },
  },
}));

import PromotionTransferTab from "./PromotionTransferTab";
import { organizationApi } from "../../../../features/organization/services/organizationApi";

describe("PromotionTransferTab create form", () => {
  beforeEach(() => {
    apiState.changes = [];
    authState.allowed = new Set(["org.change.create", "org.change.submit", "org.change.approve", "org.change.reject", "org.change.apply"]);
    vi.clearAllMocks();
  });

  it("blocks submission and surfaces a field error for every missing required field", async () => {
    const user = userEvent.setup();
    render(<PromotionTransferTab />);

    await screen.findByText(/no promotion or transfer requests yet/i);
    await user.click(screen.getByRole("button", { name: /new promotion \/ transfer/i }));
    await user.click(screen.getByRole("button", { name: /create draft/i }));

    expect(await screen.findByText(/select the employee/i)).toBeInTheDocument();
    expect(screen.getByText(/select the target department/i)).toBeInTheDocument();
    expect(screen.getByText(/select the target position/i)).toBeInTheDocument();
    expect(screen.getByText(/select the target designation/i)).toBeInTheDocument();
    expect(screen.getByText(/select the target manager/i)).toBeInTheDocument();
    expect(screen.getByText(/effective date is required/i)).toBeInTheDocument();
    expect(screen.getByText(/a reason is required/i)).toBeInTheDocument();
    expect(screen.getByText(/organization owner approver is required/i)).toBeInTheDocument();
    expect(screen.getByText(/hr approver is required/i)).toBeInTheDocument();
    expect(organizationApi.createPromotionTransfer).not.toHaveBeenCalled();
  });

  it("rejects a reason that is only whitespace", async () => {
    const user = userEvent.setup();
    render(<PromotionTransferTab />);

    await screen.findByText(/no promotion or transfer requests yet/i);
    await user.click(screen.getByRole("button", { name: /new promotion \/ transfer/i }));

    await user.type(screen.getByLabelText(/reason \*/i), "   ");
    await user.click(screen.getByRole("button", { name: /create draft/i }));

    expect(await screen.findByText(/a reason is required/i)).toBeInTheDocument();
    expect(organizationApi.createPromotionTransfer).not.toHaveBeenCalled();
  });

  it("submits once every required field is filled in", async () => {
    const user = userEvent.setup();
    render(<PromotionTransferTab />);

    await screen.findByText(/no promotion or transfer requests yet/i);
    await user.click(screen.getByRole("button", { name: /new promotion \/ transfer/i }));

    await user.type(screen.getByLabelText("Employee *"), "42");
    await user.selectOptions(await screen.findByLabelText(/target department/i), "1");
    await user.selectOptions(await screen.findByLabelText(/target position/i), "10");
    await user.selectOptions(screen.getByLabelText(/target designation/i), "5");
    fireEvent.change(screen.getByLabelText(/effective date/i), { target: { value: "2026-03-01" } });
    await user.type(screen.getByLabelText("Target Manager *"), "7");
    await user.type(screen.getByLabelText(/reason \*/i), "Promotion to Marketing Lead");
    await user.type(screen.getByLabelText("Organization Owner Approver *"), "8");
    await user.type(screen.getByLabelText("HR Approver *"), "9");

    await user.click(screen.getByRole("button", { name: /create draft/i }));

    await waitFor(() => expect(organizationApi.createPromotionTransfer).toHaveBeenCalledTimes(1));
    const payload = organizationApi.createPromotionTransfer.mock.calls[0][0];
    expect(payload).toMatchObject({
      employeeId: 42,
      organizationUnitId: 1,
      positionId: 10,
      designationId: 5,
      managerUserId: 7,
      effectiveFrom: "2026-03-01",
      reason: "Promotion to Marketing Lead",
      organizationOwnerApproverId: 8,
      hrApproverId: 9,
    });
  });

  it("does not show the create button when the actor lacks org.change.create", async () => {
    authState.allowed = new Set();
    render(<PromotionTransferTab />);

    await screen.findByText(/no promotion or transfer requests yet/i);
    expect(screen.queryByRole("button", { name: /new promotion \/ transfer/i })).not.toBeInTheDocument();
  });
});
