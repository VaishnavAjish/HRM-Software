import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ allowed: new Set() }));

vi.mock("../../../../context/AuthContext", () => ({
  useAuth: () => ({ user: { accessToken: "token", tokenType: "Bearer" } }),
}));
vi.mock("../../../../context/CompanyContext", () => ({
  useCompany: () => ({ companyScope: { companyId: "alpha" }, scopeKey: "alpha" }),
}));
vi.mock("../../../../hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: (code) => state.allowed.has(code) }),
}));
vi.mock("../../../../utils/api", () => ({
  salaryApi: {
    getDepartments: vi.fn().mockResolvedValue({ status: true, data: [] }),
    getAllEmployees: vi.fn().mockResolvedValue({ status: true, data: [] }),
  },
  hrApi: {
    getRecruitmentDashboard: vi.fn().mockResolvedValue({ status: true, data: { kpis: {}, funnel: [], alerts: {}, analytics: {} } }),
  },
}));

vi.mock("./RequisitionsTab", () => ({ default: () => <div>Requisitions Content</div> }));
vi.mock("./RecruitmentDashboardTab", () => ({ default: () => <div>Dashboard Content</div> }));
vi.mock("../CandidatePipeline", () => ({ default: () => <div>Candidates Content</div> }));
vi.mock("./AssessmentTab", () => ({ default: () => <div>Assessment Content</div> }));
vi.mock("../InterviewManagement", () => ({ default: () => <div>Interview Content</div> }));
vi.mock("../OfferManagement", () => ({ default: () => <div>Offer Content</div> }));
vi.mock("./ApprovalReviewTab", () => ({ default: ({ kind }) => <div>{kind} Content</div> }));

import HiringWorkspace from "./HiringWorkspace";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

function setup(initial = "/admin/hr/hiring") {
  const router = createMemoryRouter([{
    path: "/admin/hr/hiring",
    element: <><HiringWorkspace /><LocationProbe /></>,
  }], { initialEntries: [initial] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  state.allowed = new Set();
});

describe("HiringWorkspace approval tabs", () => {
  it("keeps the original five tabs first and appends both permitted review tabs", () => {
    state.allowed = new Set([
      "ui.hr.hiring.hiring_manager_review",
      "ui.hr.hiring.director_review",
    ]);
    setup();

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Dashboard", "Requisitions", "Candidates", "Assessment", "Interview", "Offer", "HR Manager", "Director",
    ]);
  });

  it("shows each review tab only with its matching permission", () => {
    state.allowed = new Set(["ui.hr.hiring.hiring_manager_review"]);
    setup();

    expect(screen.getByRole("button", { name: "HR Manager" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Director" })).not.toBeInTheDocument();
  });

  it("supports direct links, tab URL updates, and browser navigation", async () => {
    state.allowed = new Set([
      "ui.hr.hiring.hiring_manager_review",
      "ui.hr.hiring.director_review",
    ]);
    const router = setup("/admin/hr/hiring?tab=director");

    expect(screen.getByText("director Content")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "HR Manager" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("?tab=hr-manager"));
    expect(screen.getByText("hr-manager Content")).toBeInTheDocument();

    await router.navigate(-1);
    await waitFor(() => expect(screen.getByText("director Content")).toBeInTheDocument());
  });

  it("falls back safely when a direct-linked review tab is not permitted", async () => {
    setup("/admin/hr/hiring?tab=director");

    expect(screen.getByText("Dashboard Content")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("?tab=dashboard"));
  });
});
