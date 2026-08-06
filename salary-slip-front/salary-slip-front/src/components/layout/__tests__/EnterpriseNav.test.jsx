import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LayoutDashboard, Users, Calendar } from "lucide-react";
import EnterpriseNav from "../EnterpriseNav";

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

function renderNav(route = "/admin") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <EnterpriseNav />
    </MemoryRouter>,
  );
}

beforeEach(() => logout.mockClear());

describe("EnterpriseNav", () => {
  it("renders one rail control per navigation item", () => {
    renderNav();
    expect(screen.getByLabelText("Dashboard")).toBeInTheDocument();
    expect(screen.getByLabelText("Employees")).toBeInTheDocument();
    expect(screen.getByLabelText("Attendance")).toBeInTheDocument();
  });

  it("hides every flyout until an icon is clicked", () => {
    renderNav();
    expect(screen.queryByText("Employee Master")).not.toBeInTheDocument();
  });

  it("opens the matching flyout on click", () => {
    renderNav();
    fireEvent.click(screen.getByLabelText("Employees"));

    expect(screen.getByRole("navigation", { name: "Employees navigation" })).toBeInTheDocument();
    expect(screen.getByText("Employee Master")).toBeInTheDocument();
    expect(screen.getByText("View Employees")).toBeInTheDocument();
  });

  it("keeps only one flyout open when another module is clicked", () => {
    renderNav();
    fireEvent.click(screen.getByLabelText("Employees"));
    fireEvent.click(screen.getByLabelText("Attendance"));

    expect(screen.queryByText("Employee Master")).not.toBeInTheDocument();
    expect(screen.getByText("Shift")).toBeInTheDocument();
  });

  it("closes when the same icon is clicked again", () => {
    renderNav();
    const trigger = screen.getByLabelText("Employees");

    fireEvent.click(trigger);
    expect(screen.getByText("Employee Master")).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByText("Employee Master")).not.toBeInTheDocument();
  });

  it("closes via the flyout close button", () => {
    renderNav();
    fireEvent.click(screen.getByLabelText("Employees"));
    fireEvent.click(screen.getByLabelText("Close Employees navigation"));

    expect(screen.queryByText("Employee Master")).not.toBeInTheDocument();
  });

  it("closes on Escape", () => {
    renderNav();
    fireEvent.click(screen.getByLabelText("Employees"));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByText("Employee Master")).not.toBeInTheDocument();
  });

  it("closes when clicking outside the navigation", () => {
    renderNav();
    fireEvent.click(screen.getByLabelText("Employees"));
    fireEvent.mouseDown(document.body);

    expect(screen.queryByText("Employee Master")).not.toBeInTheDocument();
  });

  it("closes after navigating to a sub page", () => {
    renderNav();
    fireEvent.click(screen.getByLabelText("Employees"));
    fireEvent.click(screen.getByText("View Employees"));

    expect(screen.queryByText("Employee Master")).not.toBeInTheDocument();
  });

  it("a leaf item is a link and opens no flyout", () => {
    renderNav();
    const dashboard = screen.getByLabelText("Dashboard");

    expect(dashboard.tagName).toBe("A");
    expect(dashboard).toHaveAttribute("href", "/admin");
    fireEvent.click(dashboard);
    expect(screen.queryByRole("navigation", { name: /navigation$/ })).not.toBeInTheDocument();
  });

  it("exposes aria-expanded on module triggers", () => {
    renderNav();
    const trigger = screen.getByLabelText("Employees");

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("marks module triggers as popup menus", () => {
    renderNav();
    expect(screen.getByLabelText("Attendance")).toHaveAttribute("aria-haspopup", "menu");
  });

  it("renders sub items as real router links preserving their routes", () => {
    renderNav();
    fireEvent.click(screen.getByLabelText("Attendance"));

    expect(screen.getByText("Shift").closest("a")).toHaveAttribute(
      "href",
      "/admin/attendance/shift",
    );
  });

  it("offers profile, help and logout controls", () => {
    renderNav();
    expect(screen.getByLabelText("Profile")).toBeInTheDocument();
    expect(screen.getByLabelText("Help")).toBeInTheDocument();
    expect(screen.getByLabelText("Log out")).toBeInTheDocument();
  });

  it("logs out through the existing auth context", () => {
    renderNav();
    fireEvent.click(screen.getByLabelText("Log out"));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("does not render a filter box for short menus", () => {
    renderNav();
    fireEvent.click(screen.getByLabelText("Employees"));
    expect(screen.queryByPlaceholderText("Filter…")).not.toBeInTheDocument();
  });
});
