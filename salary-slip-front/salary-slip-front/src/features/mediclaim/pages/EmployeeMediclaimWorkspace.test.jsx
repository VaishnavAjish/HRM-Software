import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mirrors `src/pages/admin/hr/hiring/HiringWorkspace.test.jsx`'s exact
// pattern. `useMediclaimLookups` is exercised for real (not mocked) since it
// only calls the mocked `mediclaimApi` — this also incidentally proves the
// workspace mounts it without crashing when nothing is granted.
const state = vi.hoisted(() => ({ allowed: new Set() }));

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ user: { accessToken: "token", tokenType: "Bearer" } }),
}));

vi.mock("../services/mediclaimApi", () => ({
  mediclaimApi: {
    hospitals: vi.fn().mockResolvedValue({ data: { data: [] } }),
    ruleBooks: vi.fn().mockResolvedValue({ data: { data: [] } }),
    myMembers: vi.fn().mockResolvedValue({ data: { data: [] } }),
  },
}));

vi.mock("../hooks/useMediclaimAuthorization", () => ({
  useMediclaimAuthorization: () => ({ can: (code) => state.allowed.has(code) }),
}));

vi.mock("./employee/tabs/MyCoverageTab", () => ({ default: () => <div>Coverage Content</div> }));
vi.mock("./employee/tabs/FamilyMembersTab", () => ({ default: () => <div>Family Content</div> }));
vi.mock("./employee/tabs/CardsTab", () => ({ default: () => <div>Cards Content</div> }));
vi.mock("./employee/tabs/NotifyOfficeTab", () => ({ default: () => <div>Notify Content</div> }));
vi.mock("./employee/tabs/SubmitClaimTab", () => ({ default: () => <div>Submit Content</div> }));
vi.mock("./employee/tabs/MyClaimsTab", () => ({ default: () => <div>MyClaims Content</div> }));
vi.mock("./employee/tabs/HospitalsTab", () => ({ default: () => <div>Hospitals Content</div> }));
vi.mock("./employee/tabs/RuleBookTab", () => ({ default: () => <div>RuleBook Content</div> }));
vi.mock("./employee/tabs/HistoryTab", () => ({ default: () => <div>History Content</div> }));
vi.mock("./employee/tabs/TeamClaimsTab", () => ({ default: () => <div>Team Content</div> }));
vi.mock("./employee/tabs/PendingMyApprovalTab", () => ({ default: () => <div>Pending Content</div> }));

import EmployeeMediclaimWorkspace from "./EmployeeMediclaimWorkspace";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

function setup(initial = "/employee/tds/mediclaim") {
  const router = createMemoryRouter([{
    path: "/employee/tds/mediclaim",
    element: <><EmployeeMediclaimWorkspace /><LocationProbe /></>,
  }], { initialEntries: [initial] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  state.allowed = new Set();
});

describe("EmployeeMediclaimWorkspace tab gating", () => {
  it("shows the nine unconditional tabs with no manager permissions granted", () => {
    setup();

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "My Coverage", "Family Members", "Cards", "Notify Office", "Submit Claim",
      "My Claims", "Hospitals", "Rule Book", "History",
    ]);
  });

  it("hides Team Claims and Pending My Approval without their permissions", () => {
    setup();

    expect(screen.queryByRole("button", { name: "Team Claims" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pending My Approval" })).not.toBeInTheDocument();
  });

  it("shows Team Claims only with mediclaim.team_claim.read", () => {
    state.allowed = new Set(["mediclaim.team_claim.read"]);
    setup();

    expect(screen.getByRole("button", { name: "Team Claims" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pending My Approval" })).not.toBeInTheDocument();
  });

  it("shows Pending My Approval only with mediclaim.claim.manager.decide", () => {
    state.allowed = new Set(["mediclaim.claim.manager.decide"]);
    setup();

    expect(screen.getByRole("button", { name: "Pending My Approval" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Team Claims" })).not.toBeInTheDocument();
  });

  it("shows both manager tabs together once both permissions are granted, appended after the unconditional nine", () => {
    state.allowed = new Set(["mediclaim.team_claim.read", "mediclaim.claim.manager.decide"]);
    setup();

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "My Coverage", "Family Members", "Cards", "Notify Office", "Submit Claim",
      "My Claims", "Hospitals", "Rule Book", "History", "Team Claims", "Pending My Approval",
    ]);
  });

  it("supports direct links, tab URL updates, and browser navigation", async () => {
    state.allowed = new Set(["mediclaim.team_claim.read", "mediclaim.claim.manager.decide"]);
    const router = setup("/employee/tds/mediclaim?tab=pending");

    expect(screen.getByText("Pending Content")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Team Claims" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("?tab=team"));
    expect(screen.getByText("Team Content")).toBeInTheDocument();

    await router.navigate(-1);
    await waitFor(() => expect(screen.getByText("Pending Content")).toBeInTheDocument());
  });

  it("falls back safely to My Coverage when a direct-linked manager tab is not permitted", async () => {
    setup("/employee/tds/mediclaim?tab=pending");

    expect(screen.getByText("Coverage Content")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("?tab=coverage"));
  });
});

describe("EmployeeMediclaimWorkspace accessibility & responsiveness", () => {
  it("lets keyboard Tab traverse the tab bar in visible order", async () => {
    const user = userEvent.setup();
    setup();

    const buttons = screen.getAllByRole("button");
    await user.tab();
    expect(document.activeElement).toBe(buttons[0]);
    for (let i = 1; i < buttons.length; i += 1) {
      await user.tab();
      expect(document.activeElement).toBe(buttons[i]);
    }
  });

  it("keeps the tab bar horizontally scrollable instead of wrapping at narrow widths", () => {
    setup();

    const tabBar = screen.getByRole("button", { name: "My Coverage" }).parentElement;
    expect(tabBar.className).toMatch(/overflow-x-auto/);
  });
});
