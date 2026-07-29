import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { useAuth } from "../../context/AuthContext";

const pageTitles = {
  "/admin": "Dashboard",
  "/admin/employees": "Employee Management",
  "/admin/salary": "HRMS",
  "/admin/attendance": "Attendance",
  "/admin/attendance/shift": "Shift",
  "/admin/trial-form": "Trial Form",
  "/admin/reports": "Reports",
  "/admin/settings": "Settings",
  "/admin/profile": "My Profile",
  "/employee": "Dashboard",
  "/employee/salary": "My Salary",
  "/employee/payslips": "Payslips",
  "/employee/attendance": "Attendance",
  "/employee/profile": "Profile",
  "/agent": "Agent Portal",
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

  const activeWidth = isCollapsed ? 0 : SIDEBAR_WIDTH;

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
