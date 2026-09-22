import { describe, expect, it } from "vitest";
import { Receipt } from "lucide-react";
import { decorateNavigation, buildEmployeeNav } from "./useNavItems";

const nav = [
  { to: "/admin", label: "Dashboard" },
  {
    label: "Forms",
    subItems: [
      { to: "/admin/appointments", label: "Appointments" },
      { to: "/admin/trial-form", label: "Trial Form" },
    ],
  },
  { to: "/admin/salary", label: "Salary" },
];

describe("permission-driven navigation", () => {
  it("shows allowed routes, disables denied routes and removes unassigned routes", () => {
    const states = {
      "/admin": "allow",
      "/admin/appointments": "deny",
      "/admin/trial-form": "unassigned",
      "/admin/salary": "unassigned",
    };

    expect(decorateNavigation(nav, (path) => states[path] ?? "allow")).toEqual([
      { to: "/admin", label: "Dashboard", disabled: false },
      {
        label: "Forms",
        disabled: true,
        subItems: [
          { to: "/admin/appointments", label: "Appointments", disabled: true },
        ],
      },
    ]);
  });
});

describe("buildEmployeeNav", () => {
  it("keeps Form 16 in a Statutory & Benefits group and hides Mediclaim when the module is unavailable", () => {
    const nav = buildEmployeeNav(() => false);
    const tds = nav.find((item) => item.label === "Statutory & Benefits");

    expect(tds).toEqual({
      label: "Statutory & Benefits",
      icon: Receipt,
      subItems: [{ to: "/employee/form16", label: "Form 16" }],
    });
  });

  it("adds Mediclaim under the Statutory & Benefits group when the module is available", () => {
    const nav = buildEmployeeNav(() => true);
    const tds = nav.find((item) => item.label === "Statutory & Benefits");

    expect(tds.subItems).toEqual([
      { to: "/employee/form16", label: "Form 16" },
      { to: "/employee/tds/mediclaim", label: "Mediclaim" },
    ]);
  });

  it("leaves every other employee nav entry unchanged", () => {
    const nav = buildEmployeeNav(() => true);

    expect(nav.map((item) => item.to || item.label)).toEqual([
      "/employee",
      "Department & Management",
      "/employee/payslips",
      "Statutory & Benefits",
      "/employee/tickets",
      "/employee/profile",
      "/employee/appointment",
    ]);
  });

  it("composes with decorateNavigation the same way the admin nav does", () => {
    const nav = buildEmployeeNav(() => true);
    const states = { "/employee/tds/mediclaim": "unassigned" };

    const decorated = decorateNavigation(nav, (path) => states[path] ?? "allow");
    const tds = decorated.find((item) => item.label === "Statutory & Benefits");

    expect(tds.subItems).toEqual([
      { to: "/employee/form16", label: "Form 16", disabled: false },
    ]);
  });
});
