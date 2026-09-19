import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNavItems } from "../useNavItems";

/**
 * F8 nav/routing regression, admin side.
 *
 * `useNavItems.test.js` already covers `buildEmployeeNav`'s module-hidden
 * and `decorateNavigation`'s unassigned-hidden states for the employee TDS
 * group (added in F2) — this file adds the coverage that was still missing:
 * the ADMIN side's `getAdminNav()` TDS->Mediclaim entry (not exported, only
 * reachable through the real `useNavItems()` hook), and the "denied but
 * visible" state (as opposed to "unassigned/hidden") for both shells, which
 * neither existing nav test file exercises for the Mediclaim entry.
 *
 * `getAdminNav` is intentionally not exported (see useNavItems.js) so this
 * renders a probe component through the real hook with every dependency
 * hook mocked, the same technique `EnterpriseNav.test.jsx` uses in reverse
 * (it mocks `useNavItems` itself; here we mock what `useNavItems` itself
 * calls and exercise the real implementation).
 */

const authState = vi.hoisted(() => ({
  user: null,
  routeState: () => "allow",
}));
const moduleState = vi.hoisted(() => ({ available: new Set() }));

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ user: authState.user }),
}));
vi.mock("../../../context/CompanyContext", () => ({
  useCompany: () => ({ companyId: "nidhi-impex", isAllCompanies: false }),
}));
vi.mock("../../../hooks/useModuleAvailability", () => ({
  useModuleAvailability: () => ({ isAvailable: (mod) => moduleState.available.has(mod) }),
}));
vi.mock("../../../hooks/useAuthorization", () => ({
  useAuthorization: () => ({ routeState: authState.routeState }),
}));

function NavProbe() {
  const nav = useNavItems();
  return <pre data-testid="nav">{JSON.stringify(nav)}</pre>;
}

function renderNav() {
  render(<NavProbe />);
  return JSON.parse(screen.getByTestId("nav").textContent);
}

function findTds(nav) {
  return nav.find((item) => item.label === "Statutory & Benefits") || null;
}

beforeEach(() => {
  authState.user = null;
  authState.routeState = () => "allow";
  moduleState.available = new Set();
});

describe("admin TDS -> Mediclaim nav (getAdminNav, reached only via useNavItems())", () => {
  const admin = (overrides = {}) => ({
    role: "admin",
    rawRole: 0, // super-admin: hasAccess() short-circuits true for every legacy page key
    ...overrides,
  });

  it("shows Mediclaim under TDS when the module is available and permitted", () => {
    authState.user = admin();
    moduleState.available = new Set(["mediclaim"]);

    const tds = findTds(renderNav());

    expect(tds.subItems).toContainEqual({ to: "/admin/tds/mediclaim", label: "Mediclaim", disabled: false });
  });

  it("hides Mediclaim (module-hidden) when the module is not yet available, even though permitted", () => {
    authState.user = admin();
    moduleState.available = new Set(); // mediclaim not ready

    const tds = findTds(renderNav());

    expect(tds.subItems.map((s) => s.label)).not.toContain("Mediclaim");
    // TDS Calculation / Form 16 are unaffected by the module gate.
    expect(tds.subItems.map((s) => s.label)).toEqual(["TDS Calculation", "Form 16"]);
  });

  it("hides Mediclaim (permission-hidden) when the permission is explicitly not granted, even though the module is available", () => {
    authState.user = admin({
      rawRole: 5,
      authorization: {
        permissions: {
          "ui.admin.tds.view": { allowed: true },
          "ui.admin.form16.view": { allowed: true },
          "ui.admin.mediclaim.view": { allowed: false },
        },
      },
    });
    moduleState.available = new Set(["mediclaim"]);

    const tds = findTds(renderNav());

    expect(tds.subItems.map((s) => s.label)).toEqual(["TDS Calculation", "Form 16"]);
  });

  it("shows Mediclaim disabled (permission-denied, not hidden) when routeState marks the route denied", () => {
    authState.user = admin();
    moduleState.available = new Set(["mediclaim"]);
    authState.routeState = (path) => (path === "/admin/tds/mediclaim" ? "deny" : "allow");

    const tds = findTds(renderNav());

    expect(tds.subItems).toContainEqual({ to: "/admin/tds/mediclaim", label: "Mediclaim", disabled: true });
    // A denied sibling doesn't take the rest of the group down with it.
    expect(tds.subItems.find((s) => s.label === "Form 16")).toEqual({ to: "/admin/form16", label: "Form 16", disabled: false });

    authState.routeState = () => "allow";
  });
});

describe("employee TDS -> Mediclaim nav (buildEmployeeNav, via the real useNavItems() hook)", () => {
  const completeEmployee = (overrides = {}) => ({
    role: "employee",
    name: "John Doe",
    phone: "9876543210",
    dob: "1990-01-01",
    gender: "Male",
    department: "IT",
    designation: "Engineer",
    address: "123 Street",
    hasAadhaar: true,
    panCardNo: "ABCDE1234F",
    bankName: "HDFC",
    bankAccountNo: "1234567890",
    bankIfscCode: "HDFC0001234",
    photo: "photo_employee_123.jpg",
    ...overrides,
  });

  it("shows Mediclaim under TDS for an employee once the module is available", () => {
    authState.user = completeEmployee();
    moduleState.available = new Set(["mediclaim", "tickets"]);

    const tds = findTds(renderNav());

    expect(tds.subItems).toContainEqual({ to: "/employee/tds/mediclaim", label: "Mediclaim", disabled: false });
  });

  it("hides Mediclaim (module-hidden) for an employee when the module is unavailable", () => {
    authState.user = { role: "employee" };
    moduleState.available = new Set(["tickets"]);

    const tds = findTds(renderNav());

    expect(tds.subItems.map((s) => s.label)).toEqual(["Form 16"]);
  });

  it("shows Mediclaim disabled (permission-denied, not hidden) for an employee when routeState marks the route denied", () => {
    authState.user = { role: "employee" };
    moduleState.available = new Set(["mediclaim", "tickets"]);
    authState.routeState = (path) => (path === "/employee/tds/mediclaim" ? "deny" : "allow");

    const tds = findTds(renderNav());

    expect(tds.subItems).toContainEqual({ to: "/employee/tds/mediclaim", label: "Mediclaim", disabled: true });

    authState.routeState = () => "allow";
  });

  it("hides Mediclaim (permission-hidden/unassigned) for an employee when nothing has decided the route", () => {
    authState.user = { role: "employee" };
    moduleState.available = new Set(["mediclaim", "tickets"]);
    authState.routeState = (path) => (path === "/employee/tds/mediclaim" ? "unassigned" : "allow");

    const tds = findTds(renderNav());

    expect(tds.subItems.map((s) => s.label)).toEqual(["Form 16"]);

    authState.routeState = () => "allow";
  });
});
