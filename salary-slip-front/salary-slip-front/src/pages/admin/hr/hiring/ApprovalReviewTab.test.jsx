import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ mayDecide: true }));

vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../../../../context/AuthContext", () => ({
  useAuth: () => ({ user: { accessToken: "token", tokenType: "Bearer" } }),
}));
vi.mock("../../../../context/CompanyContext", () => ({
  useCompany: () => ({ companyScope: { companyId: "alpha" }, scopeKey: "alpha" }),
}));
vi.mock("../../../../hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => authState.mayDecide }),
}));
vi.mock("../../../../utils/api", () => ({
  hrApi: {
    getRequisitionApprovalQueue: vi.fn(),
    getRequisitionApprovalHistory: vi.fn(),
    decideRequisition: vi.fn(),
  },
}));

import { hrApi } from "../../../../utils/api";
import ApprovalReviewTab from "./ApprovalReviewTab";

const STEP = {
  id: 10,
  status: "PENDING",
  cycle: {
    id: 20,
    cycle_number: 1,
    status: "PENDING",
    submitted_at: "2026-08-14T10:00:00Z",
    snapshot: {
      requisition: { title: "Platform Engineer", openings: 2, salary_min: 500000, salary_max: 700000, priority: "high" },
      requested_by: { id: 1, name: "Requester" },
      department: { id: 2, name: "Engineering" },
      department_manager: { id: 3, name: "Department Head" },
    },
    steps: [{ id: 10, step_type: "HIRING_MANAGER", status: "PENDING", assigned_user: { name: "Reviewer" } }],
    requisition: { id: 4, title: "Platform Engineer", priority: "high", department: { name: "Engineering" } },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  authState.mayDecide = true;
  hrApi.getRequisitionApprovalQueue.mockResolvedValue({
    status: true,
    data: { data: [STEP], total: 1 },
    counts: { awaiting: 1, approved: 0, rejected: 0 },
  });
  hrApi.getRequisitionApprovalHistory.mockResolvedValue({ status: true, data: [STEP.cycle] });
  hrApi.decideRequisition.mockResolvedValue({ status: true });
});

it("renders assigned requisitions and records an allowed action permission decision", async () => {
  render(<ApprovalReviewTab kind="hiring-manager" />);

  await screen.findByText("Platform Engineer");
  await userEvent.click(screen.getByRole("button", { name: "Review" }));
  await userEvent.click(screen.getByRole("button", { name: "Approve" }));
  await userEvent.type(screen.getByPlaceholderText("Add a review note..."), "Reviewed and approved.");
  await userEvent.click(screen.getByRole("button", { name: "Confirm Approval" }));

  await waitFor(() => expect(hrApi.decideRequisition).toHaveBeenCalledWith(
    4,
    "hiring-manager",
    { decision: "approved", comment: "Reviewed and approved." },
    "token",
    "Bearer",
  ));
});

it("does not render decision buttons when the action permission is denied", async () => {
  authState.mayDecide = false;
  render(<ApprovalReviewTab kind="hiring-manager" />);

  await screen.findByText("Platform Engineer");
  await userEvent.click(screen.getByRole("button", { name: "Review" }));
  expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
});
