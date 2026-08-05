import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";

// Kept in sync by hand with the "to"/"label" pairs in Sidebar.jsx's nav
// definitions — the header should always show whatever the sidebar's own
// active item is labelled.
const pageTitles = {
  "/admin": "Dashboard",
  "/admin/appointments": "Appointment Form",
  "/admin/trial-form": "Trial Form",
  "/admin/employees/add": "Employee Master",
  "/admin/employees": "View Employees",
  "/admin/salary": "Month & Batch Details",
  "/admin/salary/upload": "Salary Upload",
  "/admin/attendance": "View Attendance",
  "/admin/attendance/shift": "Shift",
  "/admin/tds/calculation": "TDS Calculation",
  "/admin/form16": "Form 16",
  "/admin/reports": "Reports",
  "/admin/settings": "Settings",
  "/admin/access-control/users": "Access Control - Users",
  "/admin/access-control/roles": "Access Control - Roles",
  "/admin/profile": "Profile",
  "/employee": "Dashboard",
  "/employee/payslips": "Payslips",
  "/employee/form16": "Form 16",
  "/employee/profile": "Profile",
  "/employee/appointment": "Appointment Form",
  "/agent": "Dashboard",
  "/agent/trial-forms": "Trial Form",
  "/agent/appointments": "Appointment Form",
  "/admin/hr": "HR Dashboard",
  "/admin/hr/hiring": "Hiring",
  "/admin/hr/assets": "Asset Allocation",
  "/admin/hr/performance": "Performance Matrix",
  "/admin/hr/exit": "Exit Management",
  "/admin/hr/reports": "HR Reports",
  "/admin/hr/training": "Training",
  "/admin/hr/settings": "HR Settings",
};

const SIDEBAR_WIDTH = 280;

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem("salaryms_sidebar_collapsed") === "true";
  });
  
  const location = useLocation();
  const title = pageTitles[location.pathname] || "Dashboard";

  useEffect(() => {
    localStorage.setItem("salaryms_sidebar_collapsed", String(isCollapsed));
  }, [isCollapsed]);

  return (
    <div
      className="flex h-screen overflow-hidden bg-gray-50 dark:bg-[var(--sidebar-bg)]"
    >
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        width={SIDEBAR_WIDTH}
        isCollapsed={isCollapsed}
        onCollapse={() => setIsCollapsed(!isCollapsed)}
      />
      {/*
        Padding, not margin. Sidebar is position:fixed, so it occupies no space
        in this flex row and this column resolves to the full container width —
        a left *margin* then pushed its right edge past the viewport by exactly
        the sidebar width. The outer overflow-hidden hid the page scrollbar, but
        <main> still measured that much wider than the visible area, so every
        wide table produced a horizontal scrollbar under the whole content area.
        Padding is inside the border box, so the width still resolves to 100%.
      */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 lg:pl-[var(--sidebar-width)] bg-gray-50 dark:bg-[var(--sidebar-bg)]`}
        style={{ "--sidebar-width": `${isCollapsed ? 80 : SIDEBAR_WIDTH}px` }}
      >
        <Header 
          onMenuClick={() => isCollapsed ? setIsCollapsed(false) : setSidebarOpen(true)} 
          title={title} 
          isCollapsed={isCollapsed} 
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50 dark:bg-[var(--sidebar-bg)]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
