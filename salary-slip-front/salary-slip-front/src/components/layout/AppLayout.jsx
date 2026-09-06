import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import EnterpriseNav, { RAIL_WIDTH, EXPANDED_WIDTH } from "./EnterpriseNav";
import Header from "./Header";

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
  "/admin/access-control/company-units": "Access Control - Company & Unit",
  "/admin/access-control/permission-matrix": "Access Control - Permission Matrix",
  "/admin/access-control/policies": "Access Control - Policies",
  "/admin/access-control/access-requests": "Access Control - Access Requests",
  "/admin/access-control/delegations": "Access Control - Delegations",
  "/admin/access-control/emergency-access": "Access Control - Emergency Access",
  "/admin/my-delegations": "My Delegations",
  "/admin/tickets": "Support Tickets",
  "/admin/tickets/control-center": "Ticket Control Center",
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
  "/admin/hr/organization": "Organization",
  "/admin/hr/hiring": "Recruitment",
  "/admin/hr/assets": "Asset Allocation",
  "/admin/hr/performance": "Performance Matrix",
  "/admin/hr/exit": "Exit Management",
  "/admin/hr/reports": "HR Reports",
  "/admin/hr/settings": "HR Settings",
  "/admin/hr/onboarding": "Onboarding",
  "/admin/hr/onboarding/journeys": "Onboarding Journeys",
  "/admin/hr/onboarding/welcome": "Welcome Portal",
  "/admin/hr/onboarding/documents": "Onboarding Documents",
  "/admin/hr/onboarding/assets": "IT Assets",
};

const SIDEBAR_WIDTH = 280;

import NotificationDrawer from "../notifications/NotificationDrawer";

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [flyoutOpen, setFlyoutOpen] = useState(() => {
    const stored = localStorage.getItem("hrms_sidebar_pinned_v2");
    return stored === null ? true : stored === "true";
  });
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem("salaryms_sidebar_collapsed") === "true";
  });

  const location = useLocation();
  const title = pageTitles[location.pathname] || "Dashboard";

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    localStorage.setItem("salaryms_sidebar_collapsed", String(isCollapsed));
  }, [isCollapsed]);

  // CSS lengths, not numbers — see the note on the constants in EnterpriseNav.
  const currentSidebarWidth = isDesktop
    ? (flyoutOpen ? EXPANDED_WIDTH : RAIL_WIDTH)
    : "0px";

  return (
    <div className="flex app-viewport-h overflow-hidden bg-gray-50 dark:bg-[var(--sidebar-bg)] font-sans">
      <div className="hidden lg:block">
        <EnterpriseNav onFlyoutChange={setFlyoutOpen} />
      </div>

      <div className="lg:hidden">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          width={SIDEBAR_WIDTH}
          isCollapsed={false}
          onCollapse={() => setIsCollapsed(!isCollapsed)}
        />
      </div>

      <div
        className="flex-1 flex flex-col min-w-0 transition-[padding-left] duration-300 ease-in-out bg-gray-50 dark:bg-[var(--sidebar-bg)]"
        style={{ paddingLeft: currentSidebarWidth }}
      >
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          title={title}
          isCollapsed={isCollapsed}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50 dark:bg-[var(--sidebar-bg)]">
          <Outlet />
        </main>
      </div>

      <NotificationDrawer />
    </div>
  );
}
