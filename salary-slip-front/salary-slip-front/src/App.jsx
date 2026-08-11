import { lazy, Suspense } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CompanyProvider } from "./context/CompanyContext";
import { ThemeProvider } from "./context/ThemeContext";

/*
 * Routes are split per page.
 *
 * Every page used to be a static import, so the entry chunk was ~2.5 MB: opening
 * any single screen downloaded, parsed and executed the whole admin app —
 * charts, grids, spreadsheet and PDF writers included. That parse/execute cost
 * is the render delay in front of first paint, not anything the visited page
 * does. Each page is now fetched when its route is first visited.
 *
 * AppLayout and Login stay eager: the shell renders on every authenticated
 * route, and Login is the first paint for a signed-out visitor, so deferring
 * either only adds a round trip.
 */
import Login from "./pages/auth/Login";
import AppLayout from "./components/layout/AppLayout";
const AddEmployeePage = lazy(() => import("./pages/admin/AddEmployeePage"));

// Admin pages
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const EmployeeManagement = lazy(() => import("./pages/admin/EmployeeManagement"));
const SalaryManagement = lazy(() => import("./pages/admin/SalaryManagement"));
const SalaryUploadPage = lazy(() => import("./pages/admin/SalaryUploadPage"));
const AttendanceView = lazy(() => import("./pages/admin/AttendanceView"));

const ShiftManagement = lazy(() => import("./pages/admin/ShiftManagement"));
const Appointments = lazy(() => import("./pages/admin/Appointments"));
const TrialForm = lazy(() => import("./pages/admin/TrialForm"));
const Reports = lazy(() => import("./pages/admin/Reports"));
const AdminForm16 = lazy(() => import("./pages/admin/Form16"));
const TdsCalculation = lazy(() => import("./pages/admin/TdsCalculation"));
const AdminProfile = lazy(() => import("./pages/admin/AdminProfile"));
const Settings = lazy(() => import("./pages/admin/Settings"));
const PermissionMatrix = lazy(() => import("./features/permissionMatrix/pages/PermissionMatrixPage"));
const AccessControlUsers = lazy(() => import("./pages/admin/accessControl/AccessControlUsers"));
const Roles = lazy(() => import("./pages/admin/accessControl/Roles"));
const Policies = lazy(() => import("./pages/admin/accessControl/Policies"));
const AccessRequests = lazy(() => import("./pages/admin/accessControl/AccessRequests"));
const Delegations = lazy(() => import("./pages/admin/accessControl/Delegations"));
const EmergencyAccess = lazy(() => import("./pages/admin/accessControl/EmergencyAccess"));

// Support tickets — staff queue, Super Admin control center, and employee screens.
const AdminTickets = lazy(() => import("./pages/admin/Tickets"));
const SuperAdminTicketControlCenter = lazy(() => import("./pages/admin/SuperAdminTicketControlCenter"));

// Employee pages
const EmployeeDashboard = lazy(() => import("./pages/employee/Dashboard"));
const Payslips = lazy(() => import("./pages/employee/Payslips"));
const EmployeeForm16 = lazy(() => import("./pages/employee/Form16"));
const Profile = lazy(() => import("./pages/employee/Profile"));
const EmployeeAppointment = lazy(() => import("./pages/employee/EmployeeAppointment"));
const RaiseTicket = lazy(() => import("./pages/employee/RaiseTicket"));
const MyTickets = lazy(() => import("./pages/employee/MyTickets"));

// Agent pages
const AgentDashboard = lazy(() => import("./pages/agent/AgentDashboard"));
import { useAuthorization } from "./hooks/useAuthorization";

// HR module
const HrDashboard = lazy(() => import("./pages/admin/hr/HrDashboard"));
const HiringProcess = lazy(() => import("./pages/admin/hr/HiringProcess"));
const OnboardingWorkspace = lazy(() => import("./pages/admin/hr/onboarding/OnboardingWorkspace"));
const AssetAllocation = lazy(() => import("./pages/admin/hr/AssetAllocation"));
const PerformanceMatrix = lazy(() => import("./pages/admin/hr/PerformanceMatrix"));
const HrReports = lazy(() => import("./pages/admin/hr/HrReports"));
const ExitManagement = lazy(() => import("./pages/admin/hr/ExitManagement"));
const HrSettings = lazy(() => import("./pages/admin/hr/HrSettings"));
const TrainingQuizPage = lazy(() => import("./pages/admin/hr/TrainingQuizPage"));
const CandidateQuiz = lazy(() => import("./pages/public/CandidateQuiz"));
const AboutNiss = lazy(() => import("./pages/public/AboutNiss"));
import SeoManager from "./components/common/SeoManager";

function RouteLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm font-medium text-gray-600 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
        Checking session...
      </div>
    </div>
  );
}

/*
 * Why access was refused, from the snapshot itself.
 *
 * These are four different faults and only one of them is the user's to act on.
 * A single "no permissions assigned" message covered all of them, so an
 * authorization service that was simply down told people to go and ask an
 * administrator for permissions they already had — and an account with no role
 * at all got the same wording as one whose role is configured but does not
 * cover this page, which is the difference between a missing assignment and a
 * deliberate denial.
 *
 * None of these widen access. They only name the cause.
 */
function accessRefusal(user) {
  if (user?.authorizationStatus === "unavailable") {
    return {
      title: "Unable to load your permissions",
      detail:
        "We could not reach the authorization service, so access cannot be confirmed. Try again in a moment.",
    };
  }

  if ((user?.authorization?.roles ?? []).length === 0) {
    return {
      title: "No role assigned to your account",
      detail:
        "Your account has not been assigned a role yet, so it holds no permissions. Ask your administrator to assign one.",
    };
  }

  const decisions = user?.authorization?.permissions ?? {};

  if (!Object.values(decisions).some((decision) => decision?.allowed)) {
    return {
      title: "No permissions assigned",
      detail:
        "Your role does not grant access to anything yet. Ask your administrator to review it.",
    };
  }

  return {
    title: "You do not have access to this page",
    detail: "Your role does not include this page. Other pages may still be available to you.",
  };
}

/*
 * Shown when the page we would send someone to is the one being refused.
 *
 * Only reachable when a portal's own landing page is denied — but a refusal the
 * user can read beats a redirect loop that renders an empty screen.
 */
function AccessDenied({ user }) {
  const { title, detail } = accessRefusal(user);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="max-w-md rounded-2xl border border-gray-200 bg-white px-6 py-7 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{detail}</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children, requiredRole, requiredPermission }) {
  const location = useLocation();
  const { user, initializing, isAuthenticated } = useAuth();
  const { can, canRoute } = useAuthorization();

  if (initializing) return <RouteLoader />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  /*
   * Where to send someone who may not be here.
   *
   * Landing on the path we are already refusing produces a redirect to itself:
   * the guard denies, redirects, denies again, and React Router settles on
   * rendering nothing. That is how a denied /employee turned into a blank page
   * with a clean console — no error, because nothing threw.
   *
   * The portal home is the account's own tier, so it is normally reachable by
   * definition. Returning null when it is not keeps the failure visible as a
   * refusal rather than dressing it up as a loop.
   */
  const portalHome = user.role === "admin" ? "/admin" : (user.role === "agent" ? "/agent" : "/employee");
  const leaveFor = (path) =>
    path === location.pathname ? <AccessDenied user={user} /> : <Navigate to={path} replace />;

  if (requiredRole && user.role !== requiredRole) {
    return leaveFor(portalHome);
  }
  if (requiredPermission && !can(requiredPermission)) {
    return leaveFor(portalHome);
  }

  /*
   * Every registered page is guarded by the permission that governs its route,
   * without each route having to declare it.
   *
   * Only a handful of routes carried requiredPermission, so the rest were
   * reachable by typing the URL even when the Permission Matrix denied them —
   * hiding a menu item is not a boundary. Resolving the path through the same
   * registry the matrix edits closes that for every page at once, and for pages
   * added later. Routes the registry does not describe are unaffected.
   */
  if (!canRoute(location.pathname)) {
    return leaveFor(portalHome);
  }

  /*
   * An incomplete profile no longer confines an employee to /employee/profile.
   *
   * This redirect predates the Permission Matrix and outranked it: every page an
   * administrator granted the Employee role was unreachable until all eighteen
   * profile fields were filled, so a role configured with Salary, Attendance and
   * the employee dashboard still arrived at a single-item menu. Three of those
   * fields — department, designation, joining date — are set by HR and not
   * editable here, so some accounts could not have satisfied it at all.
   *
   * Completion is still shown on the profile page, which is the honest form of
   * the reminder: it tells someone what is missing without deciding what they
   * are allowed to open. Access is the Permission Matrix's answer alone.
   */

  return children;
}

function AppRoutes() {
  const { user, initializing, isAuthenticated } = useAuth();

  return (
    <Suspense fallback={<RouteLoader />}>
    <Routes>
      <Route
        path="/login"
        element={
          initializing ? (
            <RouteLoader />
          ) : isAuthenticated ? (
            <Navigate to={user.role === "admin" ? "/admin" : (user.role === "agent" ? "/agent" : "/employee")} />
          ) : (
            <Login />
          )
        }
      />

      <Route
        path="/"
        element={
          <Navigate
            to={
              isAuthenticated
                ? user.role === "admin"
                  ? "/admin"
                  : user.role === "agent"
                    ? "/agent"
                    : "/employee"
                : "/login"
            }
            replace
          />
        }
      />

      {/*
        Candidate interview quiz. Public by necessity — a candidate is not a
        user and has no login, so the per-attempt token in the URL is the
        credential. Rendered outside AppLayout so there's no sidebar/header
        to navigate away with mid-assessment.
      */}
      <Route path="/quiz/:token" element={<CandidateQuiz />} />
      <Route path="/about-niss" element={<AboutNiss />} />

      {/* Admin routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute requiredRole="admin">
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="employees" element={<EmployeeManagement />} />
        <Route path="employees/add" element={<AddEmployeePage />} />
        <Route path="salary" element={<SalaryManagement />} />
        <Route path="salary/upload" element={<SalaryUploadPage />} />
        <Route
          path="attendance"
          element={
            <ProtectedRoute requiredRole="admin" requiredPermission="ui.admin.attendance.view">
              <AttendanceView />
            </ProtectedRoute>
          }
        />
        <Route
          path="attendance/shift"
          element={
            <ProtectedRoute requiredRole="admin" requiredPermission="hr.shift.read">
              <ShiftManagement />
            </ProtectedRoute>
          }
        />
        <Route path="appointments" element={<Appointments />} />
        <Route path="admins" element={<Settings />} />

        <Route path="trial-form" element={<TrialForm />} />
        <Route
          path="tds/calculation"
          element={
            <ProtectedRoute requiredRole="admin" requiredPermission="ui.admin.tds.view">
              <TdsCalculation />
            </ProtectedRoute>
          }
        />
        <Route
          path="form16"
          element={
            <ProtectedRoute requiredRole="admin" requiredPermission="ui.admin.form16.view">
              <AdminForm16 />
            </ProtectedRoute>
          }
        />
        <Route path="reports" element={<Reports />} />
        <Route path="profile" element={<AdminProfile />} />

        {/* Support tickets */}
        <Route
          path="tickets"
          element={
            <ProtectedRoute requiredRole="admin" requiredPermission="support.ticket.read">
              <AdminTickets />
            </ProtectedRoute>
          }
        />
        <Route
          path="tickets/control-center"
          element={
            <ProtectedRoute requiredRole="admin">
              <SuperAdminTicketControlCenter />
            </ProtectedRoute>
          }
        />

        {/* HR module */}
        <Route path="hr" element={<ProtectedRoute requiredPermission="hr.dashboard.read"><HrDashboard /></ProtectedRoute>} />
        <Route path="hr/hiring" element={<ProtectedRoute requiredPermission="hr.requisition.read"><HiringProcess /></ProtectedRoute>} />
        {/* Interviews now lives inside the Hiring workspace as a tab; keep the old
            link working by sending it straight to that tab. */}
        <Route path="hr/interviews" element={<Navigate to="/admin/hr/hiring?tab=interview" replace />} />
        <Route path="hr/assets" element={<ProtectedRoute requiredPermission="hr.asset.read"><AssetAllocation /></ProtectedRoute>} />
        <Route path="hr/onboarding" element={<ProtectedRoute requiredPermission="hr.onboarding.journey.read"><OnboardingWorkspace /></ProtectedRoute>} />
        <Route path="hr/onboarding/journeys" element={<Navigate to="/admin/hr/onboarding?tab=employees" replace />} />
        <Route path="hr/onboarding/welcome" element={<Navigate to="/admin/hr/onboarding" replace />} />
        <Route path="hr/onboarding/documents" element={<Navigate to="/admin/hr/onboarding?tab=documents" replace />} />
        <Route path="hr/onboarding/training" element={<Navigate to="/admin/hr/onboarding" replace />} />
        <Route path="hr/onboarding/assets" element={<Navigate to="/admin/hr/onboarding" replace />} />
        <Route path="hr/onboarding/checklists" element={<Navigate to="/admin/hr/onboarding" replace />} />
        <Route path="hr/onboarding/policies" element={<Navigate to="/admin/hr/onboarding" replace />} />
        <Route path="hr/performance" element={<ProtectedRoute requiredPermission="hr.performance.read"><PerformanceMatrix /></ProtectedRoute>} />
        <Route path="hr/reports" element={<ProtectedRoute requiredPermission="hr.report.read"><HrReports /></ProtectedRoute>} />
        <Route path="hr/exit" element={<ProtectedRoute requiredPermission="hr.exit.read"><ExitManagement /></ProtectedRoute>} />
        <Route path="hr/training" element={<ProtectedRoute requiredPermission="hr.training.read"><TrainingQuizPage /></ProtectedRoute>} />
        <Route path="hr/settings" element={<ProtectedRoute requiredPermission="hr.hr_settings.read"><HrSettings /></ProtectedRoute>} />

        {/* Access Control */}
        <Route
          path="access-control/users"
          element={
            <ProtectedRoute requiredPermission="admin.user.read">
              <AccessControlUsers />
            </ProtectedRoute>
          }
        />
        <Route
          path="access-control/roles"
          element={
            <ProtectedRoute requiredPermission="admin.role.read">
              <Roles />
            </ProtectedRoute>
          }
        />
        <Route
          path="access-control/permission-matrix"
          element={
            <ProtectedRoute requiredPermission="admin.role.read">
              <PermissionMatrix />
            </ProtectedRoute>
          }
        />
        <Route
          path="access-control/policies"
          element={
            <ProtectedRoute requiredPermission="admin.policy.read">
              <Policies />
            </ProtectedRoute>
          }
        />
        <Route
          path="access-control/access-requests"
          element={
            <ProtectedRoute requiredPermission="admin.access_request.read">
              <AccessRequests />
            </ProtectedRoute>
          }
        />
        <Route
          path="access-control/delegations"
          element={
            <ProtectedRoute requiredPermission="admin.delegation.manage">
              <Delegations />
            </ProtectedRoute>
          }
        />
        <Route
          path="access-control/emergency-access"
          element={
            <ProtectedRoute requiredPermission="admin.emergency_access.approve">
              <EmergencyAccess />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Employee routes */}
      <Route
        path="/employee"
        element={
          <ProtectedRoute requiredRole="employee">
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<EmployeeDashboard />} />
        <Route path="payslips" element={<Payslips />} />
        <Route path="form16" element={<EmployeeForm16 />} />
        <Route path="profile" element={<Profile />} />
        <Route path="appointment" element={<EmployeeAppointment />} />
        {/* "new" before the list so it is not swallowed as a ticket id. */}
        <Route path="tickets/new" element={<RaiseTicket />} />
        <Route path="tickets" element={<MyTickets />} />
      </Route>

      {/* Agent routes */}
      <Route
        path="/agent"
        element={
          <ProtectedRoute requiredRole="agent">
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AgentDashboard />} />
        <Route path="trial-forms" element={<TrialForm />} />
        <Route path="appointments" element={<Appointments />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </Suspense>
  );
}

import { NotificationProvider } from "./context/NotificationContext";

export default function App() {
  return (
    <BrowserRouter>
      <SeoManager />
      <ThemeProvider>
        <AuthProvider>
          <CompanyProvider>
            <NotificationProvider>
              <AppRoutes />
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 3000,
                  style: {
                    background: "#1e293b",
                    color: "#f1f5f9",
                    border: "1px solid #334155",
                    borderRadius: "12px",
                    fontSize: "14px",
                  },
                  success: {
                    iconTheme: { primary: "#22c55e", secondary: "#1e293b" },
                  },
                  error: {
                    iconTheme: { primary: "#ef4444", secondary: "#1e293b" },
                  },
                }}
              />
            </NotificationProvider>
          </CompanyProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
