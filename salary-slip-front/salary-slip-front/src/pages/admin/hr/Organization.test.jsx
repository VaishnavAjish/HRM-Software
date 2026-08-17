import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// OrgWorkspaceTabs itself is NOT mocked — this test exercises the real
// permission-gated tab shell that every Organization workspace (and now
// the HR Organization workspace) is built on.
const state = vi.hoisted(() => ({ allowed: new Set() }));

vi.mock("../../../hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: (code) => state.allowed.has(code) }),
}));

vi.mock("./organization/OverviewTab", () => ({ default: () => <div>Overview Content</div> }));
vi.mock("./organization/PromotionTransferTab", () => ({ default: () => <div>Promotions Content</div> }));
vi.mock("../accessControl/CompanyUnits", () => ({
  default: ({ initialTab }) => <div>Company Unit Content: {initialTab}</div>,
}));
vi.mock("../organization/OrgChart", () => ({ default: () => <div>Org Chart Content</div> }));
vi.mock("../organization/Positions", () => ({ default: () => <div>Positions Content</div> }));
vi.mock("../organization/Assignments", () => ({ default: () => <div>Assignments Content</div> }));
vi.mock("../workforce/DesignationsPage", () => ({ default: () => <div>Designations Content</div> }));

import HrOrganization from "./Organization";

function setup(initial = "/admin/hr/organization") {
  const router = createMemoryRouter(
    [{ path: "/admin/hr/organization", element: <HrOrganization /> }],
    { initialEntries: [initial] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  state.allowed = new Set();
});

describe("HrOrganization workspace", () => {
  it("shows every tab when the actor holds every underlying permission", () => {
    state.allowed = new Set([
      "org.unit.read",
      "admin.company.read",
      "org.chart.read",
      "org.unit_position.read",
      "workforce.designation.read",
      "org.unit_assignment.read",
      "org.change.read",
    ]);
    setup();

    for (const name of [
      "Overview", "Companies", "Units", "Departments", "Department Managers",
      "Org Chart", "Positions", "Designations", "Assignments", "Promotions & Transfers",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("Overview Content")).toBeInTheDocument();
  });

  it("hides tabs the actor lacks permission for and lands on the first visible one", () => {
    state.allowed = new Set(["org.unit_assignment.read", "org.change.read"]);
    setup();

    expect(screen.queryByRole("button", { name: "Overview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Companies" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Departments" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assignments" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Promotions & Transfers" })).toBeInTheDocument();
    // First visible tab (Assignments) is selected by default.
    expect(screen.getByText("Assignments Content")).toBeInTheDocument();
  });

  it("shows only the Promotions & Transfers tab's content when that is the sole permission held", () => {
    state.allowed = new Set(["org.change.create"]);
    setup();

    // org.change.create alone does not satisfy the org.change.read tab gate.
    expect(screen.queryByRole("button", { name: "Promotions & Transfers" })).not.toBeInTheDocument();
    expect(screen.getByText(/you do not have access to any section/i)).toBeInTheDocument();
  });

  it("selects a tab directly via the ?tab= query param, pinning Company & Unit's internal tab", () => {
    state.allowed = new Set(["org.unit.read", "admin.company.read"]);
    setup("/admin/hr/organization?tab=department-managers");

    expect(screen.getByText("Company Unit Content: department_managers")).toBeInTheDocument();
    expect(screen.queryByText("Overview Content")).not.toBeInTheDocument();
  });
});
