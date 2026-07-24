import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { useAuth } from "../../context/AuthContext";

const pageTitles = {
  "/admin": "Dashboard",
  "/admin/employees": "Employee Management",
  "/admin/salary": "Salary Management",
  "/admin/attendance": "Attendance",
  "/admin/trial-form": "Trial Form",
  "/admin/reports": "Reports",
  "/admin/settings": "Settings",
  "/admin/profile": "My Profile",
  "/employee": "Dashboard",
  "/employee/salary": "My Salary",
  "/employee/payslips": "Payslips",
  "/employee/attendance": "Attendance",
  "/employee/profile": "Profile",
};

const SIDEBAR_WIDTH_KEY = "salaryms_sidebar_width";
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 380;
const DEFAULT_SIDEBAR_WIDTH = MAX_SIDEBAR_WIDTH;

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const storedValue = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const storedWidth = storedValue ? Number(storedValue) : NaN;
    return Number.isFinite(storedWidth)
      ? Math.min(Math.max(storedWidth, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH)
      : DEFAULT_SIDEBAR_WIDTH;
  });
  const location = useLocation();
  const title = pageTitles[location.pathname] || "Dashboard";

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  return (
    <div
      className="flex h-screen overflow-hidden dark:bg-gray-900"
      style={{ backgroundColor: "var(--page-bg, #f9fafb)" }}
    >
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        width={sidebarWidth}
        onWidthChange={setSidebarWidth}
      />
      <div
        className="flex-1 flex flex-col min-w-0 lg:ml-[var(--sidebar-width)]"
        style={{ "--sidebar-width": `${sidebarWidth}px` }}
      >
        <Header onMenuClick={() => setSidebarOpen(true)} title={title} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
