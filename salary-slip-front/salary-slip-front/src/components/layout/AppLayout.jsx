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
  "/admin/rbac": "Dashboard",
  "/admin/rbac/users": "User Assignments",
  "/admin/rbac/permission-matrix": "Role Permission Matrix",
  "/admin/rbac/audit-logs": "Audit Logs",
  "/admin/access-control/permission-matrix": "Permission Matrix",
  "/admin/authorization": "Overview",
  "/admin/authorization/roles": "Roles",
  "/admin/authorization/policies": "Policies",
  "/admin/authorization/requests": "Access Requests",
  "/admin/authorization/audit": "Decision Audit",
  "/admin/authorization/simulator": "Simulator",
  "/admin/reports": "Reports",
  "/admin/settings": "Settings",
  "/admin/profile": "Profile",
  "/employee": "Dashboard",
  "/employee/payslips": "Payslips",
  "/employee/form16": "Form 16",
  "/employee/profile": "Profile",
  "/employee/appointment": "Appointment Form",
  "/agent": "Dashboard",
  "/agent/trial-forms": "Trial Form",
  "/agent/appointments": "Appointment Form",
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
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 lg:ml-[var(--sidebar-width)] bg-gray-50 dark:bg-[var(--sidebar-bg)]`}
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
