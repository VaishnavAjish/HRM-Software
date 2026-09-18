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
    documentRequirements: vi.fn().mockResolvedValue({ data: { data: [] } }),
    // Already past the onboarding gate by default, so every existing test
    // below keeps exercising tab-permission gating unchanged; the gate
    // itself is covered separately in the "onboarding gate" describe block
    // further down this file, which overrides this per-test.
    myCoverage: vi.fn().mockResolvedValue({
      data: { eligibility: { eligible: true }, onboarding: { ruleBookAcknowledged: true, completed: true } },
    }),
  },
}));

vi.mock("../hooks/useMediclaimAuthorization", () => ({
  useMediclaimAuthorization: () => ({ can: (code) => state.allowed.has(code) }),
}));

vi.mock("./employee/tabs/MediclaimInfoTab", () => ({ default: () => <div>Coverage Content</div> }));
vi.mock("./employee/tabs/FamilyMembersTab", () => ({ default: () => <div>Family Content</div> }));
vi.mock("./employee/tabs/MyClaimsTab", () => ({ default: () => <div>MyClaims Content</div> }));
vi.mock("./employee/tabs/RuleBookTab", () => ({ default: () => <div>RuleBook Content</div> }));
vi.mock("./employee/tabs/TeamClaimsTab", () => ({ default: () => <div>Team Content</div> }));

import { mediclaimApi } from "../services/mediclaimApi";
import EmployeeMediclaimWorkspace from "./EmployeeMediclaimWorkspace";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

function renderWorkspace(initial = "/employee/tds/mediclaim") {
  const router = createMemoryRouter([{
    path: "/employee/tds/mediclaim",
    element: <><EmployeeMediclaimWorkspace /><LocationProbe /></>,
  }], { initialEntries: [initial] });
  render(<RouterProvider router={router} />);
  return router;
}

// Waits out the workspace's own loading state before handing control back,
// so every test below sees the *settled* tab bar rather than racing it —
// this is what actually exercises the fix for the "shows every tab, then
// yanks most of them away a second later" bug: the workspace renders
// nothing tab-shaped until /me/coverage resolves, so there is nothing to
// wait for except this one screen.
async function setup(initial = "/employee/tds/mediclaim") {
  const router = renderWorkspace(initial);
  await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
  return router;
}

beforeEach(() => {
  state.allowed = new Set();
});

describe("EmployeeMediclaimWorkspace loading state", () => {
  it("shows a loading placeholder, not any tab, while /me/coverage is still in flight", () => {
    renderWorkspace();

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("EmployeeMediclaimWorkspace tab gating", () => {
  it("shows the three unconditional tabs with no manager permissions granted", async () => {
    await setup();

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Mediclaim Info", "Family Members", "My Claims",
    ]);
  });

  it("hides Team Claims without its permission", async () => {
    await setup();

    expect(screen.queryByRole("button", { name: "Team Claims" })).not.toBeInTheDocument();
  });

  it("shows Team Claims only with mediclaim.team_claim.read", async () => {
    state.allowed = new Set(["mediclaim.team_claim.read"]);
    await setup();

    expect(screen.getByRole("button", { name: "Team Claims" })).toBeInTheDocument();
  });

  it("appends Team Claims after the unconditional three once granted", async () => {
    state.allowed = new Set(["mediclaim.team_claim.read"]);
    await setup();

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Mediclaim Info", "Family Members", "My Claims",
      "Team Claims",
    ]);
  });

  it("supports direct links, tab URL updates, and browser navigation", async () => {
    state.allowed = new Set(["mediclaim.team_claim.read"]);
    const router = await setup("/employee/tds/mediclaim?tab=team");

    expect(screen.getByText("Team Content")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "My Claims" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("?tab=claims"));
    expect(screen.getByText("MyClaims Content")).toBeInTheDocument();

    await router.navigate(-1);
    await waitFor(() => expect(screen.getByText("Team Content")).toBeInTheDocument());
  });

  it("falls back safely to Mediclaim Info when a direct-linked manager tab is not permitted", async () => {
    await setup("/employee/tds/mediclaim?tab=team");

    expect(screen.getByText("Coverage Content")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("?tab=coverage"));
  });
});

describe("EmployeeMediclaimWorkspace onboarding gate", () => {
  it("cuts the tab bar down to just Rule Book and Family Members, rule book first, until onboarding is complete", async () => {
    mediclaimApi.myCoverage.mockResolvedValueOnce({
      data: { eligibility: { eligible: true }, onboarding: { ruleBookAcknowledged: false, completed: false } },
    });
    await setup();

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Rule Book", "Family Members"]);
  });

  it("defaults to the Rule Book tab while gated, not Mediclaim Info", async () => {
    mediclaimApi.myCoverage.mockResolvedValueOnce({
      data: { eligibility: { eligible: true }, onboarding: { ruleBookAcknowledged: false, completed: false } },
    });
    await setup();

    expect(screen.getByText("RuleBook Content")).toBeInTheDocument();
    expect(screen.queryByText("Coverage Content")).not.toBeInTheDocument();
  });
});

describe("EmployeeMediclaimWorkspace accessibility & responsiveness", () => {
  it("lets keyboard Tab traverse the tab bar in visible order", async () => {
    const user = userEvent.setup();
    await setup();

    const buttons = screen.getAllByRole("button");
    await user.tab();
    expect(document.activeElement).toBe(buttons[0]);
    for (let i = 1; i < buttons.length; i += 1) {
      await user.tab();
      expect(document.activeElement).toBe(buttons[i]);
    }
  });

  it("keeps the tab bar horizontally scrollable instead of wrapping at narrow widths", async () => {
    await setup();

    const tabBar = screen.getByRole("button", { name: "Mediclaim Info" }).parentElement;
    expect(tabBar.className).toMatch(/overflow-x-auto/);
  });
});
