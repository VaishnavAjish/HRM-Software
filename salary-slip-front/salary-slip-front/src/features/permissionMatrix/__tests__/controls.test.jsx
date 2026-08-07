import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import PermissionTreeTable from "../components/PermissionTreeTable";
import MatrixToolbar from "../components/MatrixToolbar";
import { copyText } from "../utils/clipboard";
import { BLOCKED_STATES } from "../models/permissionStates";

const node = (overrides = {}) => ({
  key: "ui.employees.master.delete",
  permissionCode: "ui.employees.master.delete",
  label: "Delete Employee",
  type: "action",
  assignable: true,
  sensitivity: "CRITICAL",
  configuredState: "NOT_ASSIGNED",
  effectiveResult: "DENY",
  source: "DEFAULT",
  reason: "DEFAULT_DENY",
  children: [],
  depth: 0,
  ...overrides,
});

function Harness({ rows, editable = true, onSetState = () => {}, onCopy = () => {}, onToggleExpandSpy }) {
  const [checked, setChecked] = useState(new Set());
  const [selectedKey, setSelectedKey] = useState(null);
  const [expanded, setExpanded] = useState(new Set());

  return (
    <PermissionTreeTable
      rows={rows}
      expanded={expanded}
      onToggleExpand={(key) => {
        onToggleExpandSpy?.(key);
        setExpanded((previous) => {
          const next = new Set(previous);
          next.has(key) ? next.delete(key) : next.add(key);
          return next;
        });
      }}
      configuredOf={(row) => row.configuredState}
      draft={new Map()}
      editable={editable}
      selectedKey={selectedKey}
      onSelect={setSelectedKey}
      onSetState={onSetState}
      onApplyToDescendants={() => {}}
      onCopy={onCopy}
      checked={checked}
      onToggleChecked={(key) => setChecked((previous) => {
        const next = new Set(previous);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      })}
      onToggleAll={() => setChecked((previous) =>
        previous.size > 0 ? new Set() : new Set(rows.filter((r) => r.assignable).map((r) => r.key)))}
    />
  );
}

describe("configured state picker", () => {
  const trigger = () => screen.getByRole("button", { name: /Configured state for Delete Employee/ });
  const openMenu = async (user) => {
    await user.click(trigger());
    return screen.getByRole("listbox");
  };

  it("shows the current value on the closed trigger", () => {
    render(<Harness rows={[node({ configuredState: "DENY" })]} />);

    expect(trigger()).toHaveTextContent("Deny");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("opens on click and lists every state with its description", async () => {
    const user = userEvent.setup();
    render(<Harness rows={[node()]} />);

    const listbox = await openMenu(user);

    expect(within(listbox).getByText("Grant access")).toBeInTheDocument();
    expect(within(listbox).getByText("Block access")).toBeInTheDocument();
    expect(within(listbox).getByText("Rules-based access")).toBeInTheDocument();
    expect(within(listbox).getByText("No direct decision")).toBeInTheDocument();
  });

  it("offers the states in a fixed order regardless of the current value", async () => {
    const user = userEvent.setup();
    render(<Harness rows={[node({ configuredState: "DENY" })]} />);

    const options = within(await openMenu(user)).getAllByRole("option");

    expect(options.map((o) => o.getAttribute("aria-selected"))).toEqual(["false", "true", "false", "false"]);
    expect(options[0]).toHaveTextContent("Allow");
    expect(options[3]).toHaveTextContent("Not Assigned");
  });

  it.each([
    ["Allow", "ALLOW", "NOT_ASSIGNED"],
    ["Deny", "DENY", "ALLOW"],
    ["Not Assigned", "NOT_ASSIGNED", "ALLOW"],
  ])("selecting %s updates the draft for the right permission", async (label, expected, from) => {
    const user = userEvent.setup();
    const onSetState = vi.fn();

    render(<Harness rows={[node({ configuredState: from })]} onSetState={onSetState} />);

    await openMenu(user);
    await user.click(screen.getByRole("option", { name: new RegExp(label) }));

    expect(onSetState).toHaveBeenCalledTimes(1);
    const [nodes, state] = onSetState.mock.calls[0];
    expect(state).toBe(expected);
    expect(nodes[0].key).toBe("ui.employees.master.delete");
  });

  it("re-picking the state already set is not a change", async () => {
    const user = userEvent.setup();
    const onSetState = vi.fn();

    render(<Harness rows={[node({ configuredState: "ALLOW" })]} onSetState={onSetState} />);

    await openMenu(user);
    await user.click(screen.getByRole("option", { name: /Allow/ }));

    expect(onSetState).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("marks the current state as selected", async () => {
    const user = userEvent.setup();
    render(<Harness rows={[node({ configuredState: "ALLOW" })]} />);

    await openMenu(user);

    expect(screen.getByRole("option", { name: /Allow/ })).toHaveAttribute("aria-selected", "true");
  });

  /* ---- the unavailable state ------------------------------------------- */

  it("shows Conditional rather than hiding it", async () => {
    const user = userEvent.setup();
    render(<Harness rows={[node()]} />);

    expect(within(await openMenu(user)).getByRole("option", { name: /Conditional/ })).toBeInTheDocument();
  });

  it("marks Conditional aria-disabled and explains why", async () => {
    const user = userEvent.setup();
    render(<Harness rows={[node()]} />);

    const conditional = within(await openMenu(user)).getByRole("option", { name: /Conditional/ });

    expect(conditional).toHaveAttribute("aria-disabled", "true");
    expect(conditional).toHaveTextContent(/condition editor/i);
    expect(BLOCKED_STATES.CONDITIONAL).toMatch(/condition/i);
  });

  it("does not blame the administrator for a missing capability", async () => {
    // No permission grant would make Conditional selectable, so telling someone
    // to contact an administrator would send them to ask for the impossible.
    const user = userEvent.setup();
    render(<Harness rows={[node()]} />);

    expect(await openMenu(user)).not.toHaveTextContent(/contact.*administrator/i);
  });

  it("selecting Conditional changes nothing", async () => {
    const user = userEvent.setup();
    const onSetState = vi.fn();

    render(<Harness rows={[node()]} onSetState={onSetState} />);

    await openMenu(user);
    await user.click(screen.getByRole("option", { name: /Conditional/ }));

    expect(onSetState).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("keeps Conditional reachable by keyboard so its reason can be read", async () => {
    // aria-disabled rather than skipped: an option the arrows step over is
    // invisible to a screen-reader user, who would never learn why.
    const user = userEvent.setup();
    render(<Harness rows={[node({ configuredState: "ALLOW" })]} />);

    trigger().focus();
    await user.keyboard("{Enter}{ArrowDown}{ArrowDown}");

    const listbox = screen.getByRole("listbox");
    const conditional = within(listbox).getByRole("option", { name: /Conditional/ });

    expect(listbox.getAttribute("aria-activedescendant")).toBe(conditional.id);
  });

  it("Enter on Conditional refuses to select it", async () => {
    const user = userEvent.setup();
    const onSetState = vi.fn();

    render(<Harness rows={[node({ configuredState: "ALLOW" })]} onSetState={onSetState} />);

    trigger().focus();
    await user.keyboard("{Enter}{ArrowDown}{ArrowDown}{Enter}");

    expect(onSetState).not.toHaveBeenCalled();
  });

  /* ---- keyboard --------------------------------------------------------- */

  it("opens with Space and selects with Enter", async () => {
    const user = userEvent.setup();
    const onSetState = vi.fn();

    render(<Harness rows={[node({ configuredState: "ALLOW" })]} onSetState={onSetState} />);

    trigger().focus();
    await user.keyboard("{ }");
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.keyboard("{ArrowDown}{Enter}");

    expect(onSetState.mock.calls[0][1]).toBe("DENY");
  });

  it("Home and End jump to the first and last state", async () => {
    const user = userEvent.setup();
    const onSetState = vi.fn();

    render(<Harness rows={[node({ configuredState: "ALLOW" })]} onSetState={onSetState} />);

    trigger().focus();
    await user.keyboard("{Enter}{End}{Enter}");

    expect(onSetState.mock.calls[0][1]).toBe("NOT_ASSIGNED");
  });

  it("Escape closes without changing anything", async () => {
    const user = userEvent.setup();
    const onSetState = vi.fn();

    render(<Harness rows={[node()]} onSetState={onSetState} />);

    trigger().focus();
    await user.keyboard("{Enter}{ArrowDown}{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onSetState).not.toHaveBeenCalled();
  });

  it("closes when the pointer goes elsewhere", async () => {
    const user = userEvent.setup();
    render(<Harness rows={[node()]} />);

    await openMenu(user);
    await user.click(document.body);

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("only one picker stays open at a time", async () => {
    const user = userEvent.setup();
    render(<Harness rows={[node(), node({ key: "b", permissionCode: "b", label: "Second" })]} />);

    await user.click(screen.getByRole("button", { name: /Configured state for Delete Employee/ }));
    expect(screen.getAllByRole("listbox")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /Configured state for Second/ }));
    expect(screen.getAllByRole("listbox")).toHaveLength(1);
  });

  /* ---- the row must not intercept the picker's keys --------------------- */

  it("picker keys never reach the row handler", async () => {
    // The row owns Enter, Space and the arrows for selection and expand/collapse.
    // This regression made keyboard selection impossible.
    const user = userEvent.setup();
    const onSetState = vi.fn();

    render(<Harness rows={[node({ children: [node({ key: "child" })] })]} onSetState={onSetState} />);

    trigger().focus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(document.activeElement).toBe(trigger());
  });

  it("arrow keys inside the picker do not collapse the tree", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(
      <Harness
        rows={[node({ children: [node({ key: "child" })] })]}
        onToggleExpandSpy={onToggle}
      />,
    );

    trigger().focus();
    await user.keyboard("{Enter}{ArrowDown}{ArrowUp}");

    expect(onToggle).not.toHaveBeenCalled();
  });

  it("using the picker does not select the row", async () => {
    const user = userEvent.setup();
    render(<Harness rows={[node()]} />);

    trigger().focus();
    await user.keyboard("{Enter}{ArrowDown}");

    expect(screen.getByRole("row", { name: /Delete Employee/ })).toHaveAttribute("aria-selected", "false");
  });

  it("exposes listbox semantics on the trigger", () => {
    render(<Harness rows={[node()]} />);

    expect(trigger()).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("renders the menu outside the scroll container so it cannot be clipped", async () => {
    const user = userEvent.setup();

    render(
      <div style={{ overflow: "hidden", height: 40 }}>
        <Harness rows={[node()]} />
      </div>,
    );

    const listbox = await openMenu(user);

    expect(listbox.closest("[style*='overflow']")).toBeNull();
    expect(document.body.contains(listbox)).toBe(true);
  });

  it("renders a read-only badge when the role is not editable", () => {
    render(<Harness rows={[node()]} editable={false} />);

    expect(screen.queryByLabelText(/Configured state for/)).not.toBeInTheDocument();
  });
});

describe("row selection", () => {
  it("checking a row does not change its permission state", async () => {
    const user = userEvent.setup();
    const onSetState = vi.fn();

    render(<Harness rows={[node()]} onSetState={onSetState} />);

    await user.click(screen.getByLabelText("Select Delete Employee"));

    expect(screen.getByLabelText("Select Delete Employee")).toBeChecked();
    expect(onSetState).not.toHaveBeenCalled();
  });

  it("select-all covers every assignable row and clears again", async () => {
    const user = userEvent.setup();
    const rows = [node(), node({ key: "b", permissionCode: "b", label: "Second" })];

    render(<Harness rows={rows} />);

    await user.click(screen.getByLabelText("Select all visible permissions"));
    expect(screen.getByLabelText("Select Second")).toBeChecked();

    await user.click(screen.getByLabelText("Select all visible permissions"));
    expect(screen.getByLabelText("Select Second")).not.toBeChecked();
  });

  it("grouping rows offer no checkbox", () => {
    render(<Harness rows={[node({ assignable: false, label: "Table Columns", type: "section" })]} />);

    expect(screen.queryByLabelText("Select Table Columns")).not.toBeInTheDocument();
  });
});

describe("row options menu", () => {
  it("copy calls a handler that works without the async clipboard API", async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();

    render(<Harness rows={[node()]} onCopy={onCopy} />);

    await user.click(screen.getByLabelText("Options for Delete Employee"));
    await user.click(screen.getByRole("menuitem", { name: /Copy permission code/ }));

    expect(onCopy).toHaveBeenCalledWith("ui.employees.master.delete");
  });

  it("closes when the pointer goes elsewhere", async () => {
    const user = userEvent.setup();

    render(<Harness rows={[node()]} />);

    await user.click(screen.getByLabelText("Options for Delete Employee"));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("bulk actions", () => {
  const toolbar = (props = {}) => (
    <MatrixToolbar
      filters={{ search: "", state: "ALL", type: "ALL", sensitivity: "ALL" }}
      onFilterChange={() => {}}
      onExpandAll={() => {}}
      onCollapseAll={() => {}}
      onBulkApply={() => {}}
      selectedNodes={[]}
      activeFilterCount={0}
      onClearFilters={() => {}}
      editable
      {...props}
    />
  );

  it("is disabled until rows are selected", () => {
    render(toolbar());

    expect(screen.getByRole("button", { name: /Bulk Actions/ })).toBeDisabled();
  });

  it("acts on the selected rows and names the count", async () => {
    const user = userEvent.setup();
    const onBulkApply = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(toolbar({ selectedNodes: [node(), node({ key: "b" })], onBulkApply }));

    const button = screen.getByRole("button", { name: /Bulk Actions \(2\)/ });
    await user.click(button);
    await user.click(screen.getByRole("menuitem", { name: /Set selected to Deny/ }));

    expect(onBulkApply).toHaveBeenCalledWith("DENY");
    window.confirm.mockRestore();
  });

  it("a refused confirmation applies nothing", async () => {
    const user = userEvent.setup();
    const onBulkApply = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(toolbar({ selectedNodes: [node()], onBulkApply }));

    await user.click(screen.getByRole("button", { name: /Bulk Actions/ }));
    await user.click(screen.getByRole("menuitem", { name: /Set selected to Allow/ }));

    expect(onBulkApply).not.toHaveBeenCalled();
    window.confirm.mockRestore();
  });
});

describe("filters", () => {
  it("shows an active count and enables Clear only when something is set", async () => {
    const user = userEvent.setup();
    const onClearFilters = vi.fn();

    render(
      <MatrixToolbar
        filters={{ search: "salary", state: "DENY", type: "ALL", sensitivity: "ALL" }}
        onFilterChange={() => {}}
        onExpandAll={() => {}}
        onCollapseAll={() => {}}
        onBulkApply={() => {}}
        selectedNodes={[]}
        activeFilterCount={2}
        onClearFilters={onClearFilters}
        editable
      />,
    );

    const filterButton = screen.getByRole("button", { name: /Filters/ });
    expect(filterButton).toHaveTextContent("2");

    await user.click(filterButton);
    await user.click(screen.getByRole("button", { name: /Clear filters/ }));

    expect(onClearFilters).toHaveBeenCalled();
  });
});

describe("clipboard fallback", () => {
  it("falls back to execCommand where the async API is unavailable", async () => {
    const original = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    document.execCommand = vi.fn().mockReturnValue(true);

    await expect(copyText("ui.employees.master.delete")).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");

    Object.defineProperty(navigator, "clipboard", { value: original, configurable: true });
  });

  it("reports failure rather than pretending", async () => {
    const original = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    document.execCommand = vi.fn().mockReturnValue(false);

    await expect(copyText("x")).resolves.toBe(false);

    Object.defineProperty(navigator, "clipboard", { value: original, configurable: true });
  });
});
