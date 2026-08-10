import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LayoutDashboard, Users, Calendar } from "lucide-react";
import EnterpriseNav, { RAIL_WIDTH, EXPANDED_WIDTH } from "../EnterpriseNav";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  {
    label: "Employees",
    icon: Users,
    subItems: [
      { to: "/admin/employees/add", label: "Employee Master" },
      { to: "/admin/employees", label: "View Employees" },
    ],
  },
  {
    label: "Attendance",
    icon: Calendar,
    subItems: [
      { to: "/admin/attendance", label: "View Attendance" },
      { to: "/admin/attendance/shift", label: "Shift" },
    ],
  },
];

const logout = vi.fn();

vi.mock("../useNavItems", () => ({
  useNavItems: () => NAV,
  dashboardPathFor: () => "/admin",
}));

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ user: { name: "NISS Super Admin", role: "admin" }, logout }),
}));

function renderNav(route = "/admin", props = {}) {
  const utils = render(
    <MemoryRouter initialEntries={[route]}>
      <EnterpriseNav {...props} />
    </MemoryRouter>,
  );
  return { ...utils, rail: screen.getByLabelText("Sidebar navigation") };
}


/** Labels render twice while collapsed: once visibly, once in the tooltip. */
function label(text) {
  const hits = screen.getAllByText(text);
  return hits.find((el) => !el.closest('[role="tooltip"]')) ?? hits[0];
}

beforeEach(() => logout.mockClear());

describe("EnterpriseNav", () => {
  it("renders every navigation item from the shared nav source", () => {
    renderNav();
    expect(label("Dashboard")).toBeInTheDocument();
    expect(label("Employees")).toBeInTheDocument();
    expect(label("Attendance")).toBeInTheDocument();
  });

  it("starts collapsed at the rail width", () => {
    const { rail } = renderNav();
    expect(rail).toHaveStyle({ width: RAIL_WIDTH });
  });

  it("expands on hover and collapses again on leave", () => {
    vi.useFakeTimers();
    const { rail } = renderNav();

    fireEvent.mouseEnter(rail);
    expect(rail).toHaveStyle({ width: EXPANDED_WIDTH });

    fireEvent.mouseLeave(rail);
    act(() => vi.advanceTimersByTime(250));
    expect(rail).toHaveStyle({ width: RAIL_WIDTH });

    vi.useRealTimers();
  });

  it("reports expansion to the layout so content can reflow", () => {
    const onFlyoutChange = vi.fn();
    const { rail } = renderNav("/admin", { onFlyoutChange });

    onFlyoutChange.mockClear();
    fireEvent.mouseEnter(rail);
    expect(onFlyoutChange).toHaveBeenCalledWith(true);
  });

  it("keeps sub items hidden until their section is opened", () => {
    renderNav();
    expect(screen.queryAllByText("Employee Master").find((el) => !el.closest('[role="tooltip"]')) ?? null).not.toBeInTheDocument();
  });

  it("opens a section when its header is clicked", () => {
    renderNav();
    fireEvent.click(label("Employees"));

    expect(label("Employee Master")).toBeInTheDocument();
    expect(label("View Employees")).toBeInTheDocument();
  });

  it("closes the section when clicked again", () => {
    renderNav();
    const header = label("Employees");

    fireEvent.click(header);
    expect(label("Employee Master")).toBeInTheDocument();

    fireEvent.click(header);
    expect(screen.queryAllByText("Employee Master").find((el) => !el.closest('[role="tooltip"]')) ?? null).not.toBeInTheDocument();
  });

  it("allows more than one section open at a time", () => {
    renderNav();
    fireEvent.click(label("Employees"));
    fireEvent.click(label("Attendance"));

    expect(label("Employee Master")).toBeInTheDocument();
    expect(label("Shift")).toBeInTheDocument();
  });

  it("auto-opens the section owning the current route", () => {
    renderNav("/admin/attendance/shift");
    expect(label("Shift")).toBeInTheDocument();
  });

  it("does not auto-open unrelated sections", () => {
    renderNav("/admin/attendance/shift");
    expect(screen.queryAllByText("Employee Master").find((el) => !el.closest('[role="tooltip"]')) ?? null).not.toBeInTheDocument();
  });

  it("renders sub items as router links preserving their routes", () => {
    renderNav();
    fireEvent.click(label("Attendance"));

    expect(label("Shift").closest("a")).toHaveAttribute(
      "href",
      "/admin/attendance/shift",
    );
  });

  it("renders a leaf item as a direct link with no section toggle", () => {
    renderNav();
    const dashboard = label("Dashboard").closest("a");

    expect(dashboard).toHaveAttribute("href", "/admin");
  });

  it("marks the active leaf route", () => {
    renderNav("/admin");
    expect(label("Dashboard").closest("a").className).toMatch(/bg-brand-600/);
  });

  it("marks the active sub route", () => {
    renderNav("/admin/attendance/shift");
    expect(label("Shift").closest("a").className).toMatch(/bg-brand-600/);
  });

  it("links the brand mark to the role dashboard", () => {
    renderNav();
    expect(screen.getByLabelText("Home")).toHaveAttribute("href", "/admin");
  });

  it("exposes the sidebar as a labelled landmark", () => {
    const { rail } = renderNav();
    expect(rail.tagName).toBe("ASIDE");
  });
});
