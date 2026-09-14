/**
 * Route Prefetcher for Instant Page Transitions (0ms - 1ms feel)
 * Preloads page bundles into memory on hover/focus before the user clicks.
 */

const routeLoaders = {
  "/admin": () => import("../pages/admin/Dashboard"),
  "/admin/employees": () => import("../pages/admin/EmployeeManagement"),
  "/admin/employees/add": () => import("../pages/admin/AddEmployeePage"),
  "/admin/salary": () => import("../pages/admin/SalaryManagement"),
  "/admin/salary/upload": () => import("../pages/admin/SalaryUploadPage"),
  "/admin/attendance": () => import("../pages/admin/AttendanceView"),
  "/admin/attendance/shift": () => import("../pages/admin/ShiftManagement"),
  "/admin/appointments": () => import("../pages/admin/Appointments"),
  "/admin/trial-form": () => import("../pages/admin/TrialForm"),
  "/admin/reports": () => import("../pages/admin/Reports"),
  "/admin/form16": () => import("../pages/admin/Form16"),
  "/admin/tds/calculation": () => import("../pages/admin/TdsCalculation"),
  "/admin/tds/mediclaim": () => import("../pages/admin/TdsMediclaim"),
  "/admin/profile": () => import("../pages/admin/AdminProfile"),
  "/admin/settings": () => import("../pages/admin/Settings"),
  "/admin/access-control/users": () => import("../pages/admin/accessControl/AccessControlUsers"),
  "/admin/access-control/roles": () => import("../pages/admin/accessControl/Roles"),
  "/admin/access-control/permission-matrix": () => import("../features/permissionMatrix/pages/PermissionMatrixPage"),
  "/admin/access-control/policies": () => import("../pages/admin/accessControl/Policies"),
  "/admin/access-control/access-requests": () => import("../pages/admin/accessControl/AccessRequests"),
  "/admin/access-control/delegations": () => import("../pages/admin/accessControl/Delegations"),
  "/admin/access-control/emergency-access": () => import("../pages/admin/accessControl/EmergencyAccess"),
  "/admin/my-delegations": () => import("../pages/admin/accessControl/MyDelegations"),
  "/admin/tickets": () => import("../pages/admin/Tickets"),
  "/admin/tickets/control-center": () => import("../pages/admin/SuperAdminTicketControlCenter"),
  "/employee": () => import("../pages/employee/Dashboard"),
  "/employee/payslips": () => import("../pages/employee/Payslips"),
  "/employee/form16": () => import("../pages/employee/Form16"),
  "/employee/tds/mediclaim": () => import("../pages/employee/Mediclaim"),
  "/employee/profile": () => import("../pages/employee/Profile"),
  "/employee/appointment": () => import("../pages/employee/EmployeeAppointment"),
  "/employee/tickets": () => import("../pages/employee/MyTickets"),
  "/agent": () => import("../pages/agent/AgentDashboard"),
  "/admin/hr": () => import("../pages/admin/hr/HrDashboard"),
  "/admin/hr/organization": () => import("../pages/admin/hr/Organization"),
  "/admin/hr/hiring": () => import("../pages/admin/recruitment/RecruitmentDashboard"),
  "/admin/hr/onboarding": () => import("../pages/admin/hr/onboarding/OnboardingWorkspace"),
  "/admin/hr/assets": () => import("../pages/admin/hr/AssetAllocation"),
  "/admin/hr/performance": () => import("../pages/admin/hr/PerformanceMatrix"),
  "/admin/hr/reports": () => import("../pages/admin/hr/HrReports"),
  "/admin/hr/settings": () => import("../pages/admin/hr/HrSettings"),
  "/admin/hr/exit": () => import("../pages/admin/hr/ExitManagement"),
};

const prefetchedRoutes = new Set();

export function prefetchRoute(to) {
  if (!to || typeof to !== "string") return;
  const path = to.split("?")[0];
  if (prefetchedRoutes.has(path)) return;

  const loader = routeLoaders[path];
  if (loader) {
    prefetchedRoutes.add(path);
    loader().catch(() => {
      // Ignore prefetch failures; normal navigation will retry
      prefetchedRoutes.delete(path);
    });
  }
}
