import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mirrors `src/pages/admin/hr/hiring/HiringWorkspace.test.jsx`'s exact
// pattern: a `vi.hoisted` mutable permission set, `useAuthorization`-style
// `can()` mock (here via the feature's own `useMediclaimAuthorization`
// wrapper), every child tab mocked to a trivial placeholder, and
// `createMemoryRouter`/`RouterProvider` driving `?tab=` state.
const state = vi.hoisted(() => ({ allowed: new Set() }));

vi.mock("../hooks/useMediclaimAuthorization", () => ({
  useMediclaimAuthorization: () => ({ can: (code) => state.allowed.has(code) }),
}));

vi.mock("./admin/tabs/DashboardTab", () => ({ default: () => <div>Dashboard Content</div> }));
vi.mock("./admin/tabs/EmployeesTab", () => ({ default: () => <div>Employees Content</div> }));
vi.mock("./admin/tabs/ClaimsTab", () => ({ default: () => <div>Claims Content</div> }));
vi.mock("./admin/tabs/PendingReviewsTab", () => ({ default: () => <div>Pending Reviews Content</div> }));
vi.mock("./admin/tabs/SettingsTab", () => ({ default: () => <div>Settings Content</div> }));
vi.mock("./admin/tabs/ReportsTab", () => ({ default: () => <div>Reports Content</div> }));

import AdminMediclaimWorkspace from "./AdminMediclaimWorkspace";

const STAGE_DECIDE_CODES = [
  "mediclaim.claim.manager.decide",
  "mediclaim.claim.coordinator.decide",
  "mediclaim.claim.committee.decide",
  "mediclaim.claim.hr_verification.decide",
  "mediclaim.claim.director.decide",
  "mediclaim.settlement.create",
];

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

function setup(initial = "/admin/tds/mediclaim") {
  const router = createMemoryRouter([{
    path: "/admin/tds/mediclaim",
    element: <><AdminMediclaimWorkspace /><LocationProbe /></>,
  }], { initialEntries: [initial] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  state.allowed = new Set();
});

describe("AdminMediclaimWorkspace tab gating", () => {
  it("shows only the four unconditional tabs when no permission is granted", () => {
    setup();

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Dashboard", "Employees", "Claims", "Settings",
    ]);
  });

  it("shows every tab once every gating permission is granted", () => {
    state.allowed = new Set([
      "mediclaim.claim.coordinator.decide",
      "mediclaim.report.read",
    ]);
    setup();

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Dashboard", "Employees", "Claims", "Pending Reviews", "Settings", "Reports",
    ]);
  });

  it.each(STAGE_DECIDE_CODES)("shows Pending Reviews when only %s is granted (any-of gate)", (code) => {
    state.allowed = new Set([code]);
    setup();

    expect(screen.getByRole("button", { name: "Pending Reviews" })).toBeInTheDocument();
  });

  it("gates Reports independently of Pending Reviews", () => {
    state.allowed = new Set(["mediclaim.report.read"]);
    setup();

    expect(screen.getByRole("button", { name: "Reports" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pending Reviews" })).not.toBeInTheDocument();
  });

  it("supports direct links, tab URL updates, and browser navigation", async () => {
    state.allowed = new Set(["mediclaim.claim.coordinator.decide", "mediclaim.report.read"]);
    const router = setup("/admin/tds/mediclaim?tab=pending-reviews");

    expect(screen.getByText("Pending Reviews Content")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reports" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("?tab=reports"));
    expect(screen.getByText("Reports Content")).toBeInTheDocument();

    await router.navigate(-1);
    await waitFor(() => expect(screen.getByText("Pending Reviews Content")).toBeInTheDocument());
  });

  it("falls back safely to the first available tab when a direct-linked tab is not permitted", async () => {
    setup("/admin/tds/mediclaim?tab=reports");

    expect(screen.getByText("Dashboard Content")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("?tab=dashboard"));
  });
});

describe("AdminMediclaimWorkspace accessibility & responsiveness", () => {
  it("lets keyboard Tab traverse the tab bar in visible order", async () => {
    state.allowed = new Set(["mediclaim.report.read"]);
    const user = userEvent.setup();
    setup();

    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Dashboard", "Employees", "Claims", "Settings", "Reports",
    ]);

    await user.tab();
    expect(document.activeElement).toBe(buttons[0]);
    for (let i = 1; i < buttons.length; i += 1) {
      await user.tab();
      expect(document.activeElement).toBe(buttons[i]);
    }
  });

  it("keeps the tab bar horizontally scrollable instead of wrapping at narrow widths", () => {
    setup();

    const tabBar = screen.getByRole("button", { name: "Dashboard" }).parentElement;
    expect(tabBar.className).toMatch(/overflow-x-auto/);
  });
});
