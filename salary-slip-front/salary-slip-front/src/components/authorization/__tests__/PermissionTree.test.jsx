import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import PermissionTree from "../PermissionTree";
import { aggregateOf, filterTree, stateOf, collectKeys } from "../permissionTreeUtils";

const TREE = [
  {
    key: "attendance",
    label: "Attendance",
    type: "module",
    permissionKey: "ui.admin.attendance.view",
    state: "disabled",
    parentKey: null,
    sensitive: false,
    requiredCodes: ["ui.admin.attendance.view"],
    children: [
      {
        key: "attendance.view_attendance",
        label: "View Attendance",
        type: "page",
        permissionKey: "hr.attendance.read",
        state: "enabled",
        parentKey: "attendance",
        sensitive: false,
        requiredCodes: ["hr.attendance.read", "ui.admin.attendance.view"],
        children: [],
      },
      {
        key: "attendance.shift",
        label: "Shift",
        type: "page",
        permissionKey: "hr.shift.read",
        state: "disabled",
        parentKey: "attendance",
        sensitive: false,
        requiredCodes: ["hr.shift.read", "ui.admin.attendance.view"],
        children: [
          {
            key: "attendance.shift.create",
            label: "Create",
            type: "action",
            permissionKey: "hr.shift.create",
            state: "enabled",
            parentKey: "attendance.shift",
            sensitive: false,
            requiredCodes: [],
            children: [],
          },
          {
            key: "attendance.shift.delete",
            label: "Delete",
            type: "action",
            permissionKey: "hr.shift.delete",
            state: "disabled",
            parentKey: "attendance.shift",
            sensitive: false,
            requiredCodes: [],
            children: [],
          },
        ],
      },
    ],
  },
  {
    key: "employees",
    label: "Employees",
    type: "module",
    permissionKey: "ui.admin.employees.view",
    state: "enabled",
    parentKey: null,
    sensitive: false,
    requiredCodes: [],
    children: [
      {
        key: "employees.master.columns",
        label: "Table Columns",
        type: "feature",
        permissionKey: null,
        state: "not_applicable",
        parentKey: "employees",
        sensitive: false,
        requiredCodes: [],
        children: [
          {
            key: "employees.master.columns.aadhaar",
            label: "Aadhaar",
            type: "column",
            permissionKey: "hr.employee.aadhaar.reveal",
            state: "disabled",
            parentKey: "employees.master.columns",
            sensitive: true,
            requiredCodes: [],
            children: [],
          },
        ],
      },
    ],
  },
];

function renderTree(overrides = {}) {
  const props = {
    tree: TREE,
    search: "",
    expanded: new Set(collectKeys(TREE)),
    onToggleExpand: vi.fn(),
    pending: new Map(),
    onSet: vi.fn(),
    onSelect: vi.fn(),
    selectedKey: null,
    ...overrides,
  };
  return { ...render(<PermissionTree {...props} />), props };
}

describe("PermissionTree", () => {
  it("renders Attendance as a module with its pages beneath", () => {
    renderTree();
    expect(screen.getByText("Attendance")).toBeInTheDocument();
    expect(screen.getByText("View Attendance")).toBeInTheDocument();
    expect(screen.getByText("Shift")).toBeInTheDocument();
  });

  it("renders Employees and its column children", () => {
    renderTree();
    expect(screen.getByText("Employees")).toBeInTheDocument();
    expect(screen.getByText("Table Columns")).toBeInTheDocument();
    expect(screen.getByText("Aadhaar")).toBeInTheDocument();
  });

  it("shows the technical permission key as secondary text", () => {
    renderTree();
    expect(screen.getByText("hr.shift.read")).toBeInTheDocument();
  });

  it("a grouping node drives its children but shows no permission key", () => {
    renderTree();
    const row = screen.getByText("Table Columns").closest("tr");

    expect(within(row).getByText("Grouping")).toBeInTheDocument();
    expect(within(row).queryByText(/^hr\./)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Table Columns")).toBeInTheDocument();
  });

  it("labels grouping rows in the State column", () => {
    renderTree();
    expect(screen.getByText("Grouping")).toBeInTheDocument();
  });

  it("checks a leaf whose server state is enabled", () => {
    renderTree();
    expect(screen.getByLabelText(/^View Attendance/)).toBeChecked();
  });

  it("leaves a leaf unchecked when the server state is disabled", () => {
    renderTree();
    expect(screen.getByLabelText(/^Aadhaar/)).not.toBeChecked();
  });

  it("exposes aria-checked=mixed on an indeterminate parent", () => {
    renderTree();
    expect(screen.getByLabelText(/^Shift/)).toHaveAttribute("aria-checked", "mixed");
  });

  it("toggling a parent sends every assignable descendant", () => {
    const { props } = renderTree();
    fireEvent.click(screen.getByLabelText(/^Shift/));

    const [nodes, value] = props.onSet.mock.calls[0];
    const keys = nodes.map((n) => n.key);

    expect(value).toBe(true);
    expect(keys).toContain("attendance.shift");
    expect(keys).toContain("attendance.shift.create");
    expect(keys).toContain("attendance.shift.delete");
  });

  it("a parent toggle never includes a grouping node", () => {
    const { props } = renderTree();
    fireEvent.click(screen.getByLabelText(/^Employees/));

    const keys = props.onSet.mock.calls[0][0].map((n) => n.key);
    expect(keys).not.toContain("employees.master.columns");
    expect(keys).toContain("employees.master.columns.aadhaar");
  });

  it("selects a node when its row is clicked", () => {
    const { props } = renderTree();
    fireEvent.click(screen.getByText("Shift"));
    expect(props.onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ key: "attendance.shift" }),
    );
  });

  it("expand controls are accessible buttons with aria-expanded", () => {
    renderTree();
    const control = screen.getByLabelText("Collapse Attendance");
    expect(control).toHaveAttribute("aria-expanded", "true");
  });

  it("collapsing hides descendants", () => {
    renderTree({ expanded: new Set(["employees", "employees.master.columns"]) });
    expect(screen.queryByText("View Attendance")).not.toBeInTheDocument();
    expect(screen.getByText("Aadhaar")).toBeInTheDocument();
  });

  it("search keeps the matching child's ancestors visible", () => {
    renderTree({ search: "Shift" });
    expect(screen.getByText("Attendance")).toBeInTheDocument();
    expect(screen.getByText("Shift")).toBeInTheDocument();
    expect(screen.queryByText("Employees")).not.toBeInTheDocument();
  });

  it("search matches a permission key", () => {
    renderTree({ search: "aadhaar" });
    expect(screen.getByText("Employees")).toBeInTheDocument();
    expect(screen.getByText("Aadhaar")).toBeInTheDocument();
  });

  it("reports when nothing matches", () => {
    renderTree({ search: "zzzz" });
    expect(screen.getByText(/No navigation permissions match/)).toBeInTheDocument();
  });

  it("flags sensitive nodes", () => {
    renderTree();
    const row = screen.getByText("Aadhaar").closest("tr");
    expect(within(row).getByLabelText("Sensitive")).toBeInTheDocument();
  });
});

describe("permissionTreeUtils", () => {
  const shift = TREE[0].children[1];

  it("stateOf prefers a pending override", () => {
    expect(stateOf(shift, new Map())).toBe("NOT_ASSIGNED");
    expect(stateOf(shift, new Map([["hr.shift.read", "ALLOW"]]))).toBe("ALLOW");
  });

  it("stateOf reports grouping nodes as not applicable", () => {
    expect(stateOf(TREE[1].children[0], new Map())).toBe("NOT_APPLICABLE");
  });

  it("aggregateOf is indeterminate when children differ", () => {
    expect(aggregateOf(shift, new Map())).toBe("indeterminate");
  });

  it("aggregateOf is checked when every descendant is on", () => {
    const pending = new Map([["hr.shift.delete", "ALLOW"]]);
    expect(aggregateOf(shift, pending)).toBe("checked");
  });

  it("aggregateOf is unchecked when no descendant is on", () => {
    const pending = new Map([["hr.shift.create", "NOT_ASSIGNED"]]);
    expect(aggregateOf(shift, pending)).toBe("unchecked");
  });

  it("filterTree drops non-matching branches", () => {
    const result = filterTree(TREE, "shift");
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("attendance");
  });
});
