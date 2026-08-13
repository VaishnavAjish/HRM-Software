import { describe, expect, it } from "vitest";
import { decorateNavigation } from "./useNavItems";

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
