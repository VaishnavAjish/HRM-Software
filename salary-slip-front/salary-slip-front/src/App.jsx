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
const PermissionMatrix = lazy(() => import("./pages/admin/PermissionMatrix"));
const AccessControlUsers = lazy(() => import("./pages/admin/accessControl/AccessControlUsers"));
const Roles = lazy(() => import("./pages/admin/accessControl/Roles"));
const Policies = lazy(() => import("./pages/admin/accessControl/Policies"));
const AccessRequests = lazy(() => import("./pages/admin/accessControl/AccessRequests"));
const Delegations = lazy(() => import("./pages/admin/accessControl/Delegations"));
const EmergencyAccess = lazy(() => import("./pages/admin/accessControl/EmergencyAccess"));

// Employee pages
const EmployeeDashboard = lazy(() => import("./pages/employee/Dashboard"));
const Payslips = lazy(() => import("./pages/employee/Payslips"));
const EmployeeForm16 = lazy(() => import("./pages/employee/Form16"));
const Profile = lazy(() => import("./pages/employee/Profile"));
const EmployeeAppointment = lazy(() => import("./pages/employee/EmployeeAppointment"));

// Agent pages
const AgentDashboard = lazy(() => import("./pages/agent/AgentDashboard"));
import { hasStoredAadhaar } from "./utils/aadhaar";
import { useAuthorization } from "./hooks/useAuthorization";

// HR module
const HrDashboard = lazy(() => import("./pages/admin/hr/HrDashboard"));
const HiringProcess = lazy(() => import("./pages/admin/hr/HiringProcess"));
const OnboardingDashboard = lazy(() => import("./pages/admin/hr/onboarding/OnboardingDashboard"));
const OnboardingJourneys = lazy(() => import("./pages/admin/hr/onboarding/OnboardingJourneys"));
const WelcomePortal = lazy(() => import("./pages/admin/hr/onboarding/WelcomePortal"));
const DocumentCollection = lazy(() => import("./pages/admin/hr/onboarding/DocumentCollection"));
const OnboardingTraining = lazy(() => import("./pages/admin/hr/onboarding/OnboardingTraining"));
const ItAssets = lazy(() => import("./pages/admin/hr/onboarding/ItAssets"));
const OnboardingChecklists = lazy(() => import("./pages/admin/hr/onboarding/OnboardingChecklists"));
const PolicyAcceptance = lazy(() => import("./pages/admin/hr/onboarding/PolicyAcceptance"));
const AssetAllocation = lazy(() => import("./pages/admin/hr/AssetAllocation"));
const PerformanceMatrix = lazy(() => import("./pages/admin/hr/PerformanceMatrix"));
const HrReports = lazy(() => import("./pages/admin/hr/HrReports"));
const ExitManagement = lazy(() => import("./pages/admin/hr/ExitManagement"));
const HrSettings = lazy(() => import("./pages/admin/hr/HrSettings"));
const TrainingQuizPage = lazy(() => import("./pages/admin/hr/TrainingQuizPage"));

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

function ProtectedRoute({ children, requiredRole, requiredPermission }) {
  const location = useLocation();
  const { user, initializing, isAuthenticated } = useAuth();
  const { can } = useAuthorization();

  if (initializing) return <RouteLoader />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (requiredRole && user.role !== requiredRole) {
    const fallbackPath = user.role === "admin" ? "/admin" : (user.role === "agent" ? "/agent" : "/employee");
    return <Navigate to={fallbackPath} replace />;
  }
  if (requiredPermission && !can(requiredPermission)) {
    const fallbackPath = user.role === "admin" ? "/admin" : (user.role === "agent" ? "/agent" : "/employee");
    return <Navigate to={fallbackPath} replace />;
  }

  if (user.role === "employee") {
    const fields = [
      "name", "email", "phone", "dob", "address", "city", "district", "state", "pin",
      "aadhar_card_no", "pan_card_no", "bank_name", "bank_ifsc_code", "bank_account_no",
      "gender", "department", "designation", "joining_date"
    ];
    const source = {
      ...user,
      phone: user.mobile_number || user.mobile_no || user.phone,
      // Presence only — this is a completeness percentage, not a display.
      aadhar_card_no: hasStoredAadhaar(user) ? "stored" : ""
    };
    let filled = 0;
    fields.forEach(f => {
      if (source[f] !== undefined && source[f] !== null && String(source[f]).trim() !== "") {
        filled++;
      }
    });
    const isProfileComplete = (filled === fields.length);
    if (!isProfileComplete && location.pathname !== "/employee/profile") {
       return <Navigate to="/employee/profile" replace />;
    }
  }

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
        <Route path="attendance" element={<AttendanceView />} />
        <Route path="attendance/shift" element={<ShiftManagement />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="admins" element={<Settings />} />

        <Route path="trial-form" element={<TrialForm />} />
        <Route path="tds/calculation" element={<TdsCalculation />} />
        <Route path="form16" element={<AdminForm16 />} />
        <Route path="reports" element={<Reports />} />
        <Route path="profile" element={<AdminProfile />} />

        {/* HR module */}
        <Route path="hr" element={<ProtectedRoute requiredPermission="hr.dashboard.read"><HrDashboard /></ProtectedRoute>} />
        <Route path="hr/hiring" element={<ProtectedRoute requiredPermission="hr.requisition.read"><HiringProcess /></ProtectedRoute>} />
        <Route path="hr/assets" element={<ProtectedRoute requiredPermission="hr.asset.read"><AssetAllocation /></ProtectedRoute>} />
        <Route path="hr/onboarding" element={<ProtectedRoute requiredPermission="hr.onboarding.journey.read"><OnboardingDashboard /></ProtectedRoute>} />
        <Route path="hr/onboarding/journeys" element={<ProtectedRoute requiredPermission="hr.onboarding.journey.read"><OnboardingJourneys /></ProtectedRoute>} />
        <Route path="hr/onboarding/welcome" element={<ProtectedRoute requiredPermission="hr.onboarding.journey.read"><WelcomePortal /></ProtectedRoute>} />
        <Route path="hr/onboarding/documents" element={<ProtectedRoute requiredPermission="hr.onboarding.document.read"><DocumentCollection /></ProtectedRoute>} />
        <Route path="hr/onboarding/training" element={<ProtectedRoute requiredPermission="hr.onboarding.read"><OnboardingTraining /></ProtectedRoute>} />
        <Route path="hr/onboarding/assets" element={<ProtectedRoute requiredPermission="hr.onboarding.read"><ItAssets /></ProtectedRoute>} />
        <Route path="hr/onboarding/checklists" element={<ProtectedRoute requiredPermission="hr.onboarding.read"><OnboardingChecklists /></ProtectedRoute>} />
        <Route path="hr/onboarding/policies" element={<ProtectedRoute requiredPermission="hr.onboarding.read"><PolicyAcceptance /></ProtectedRoute>} />
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

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <CompanyProvider>
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
          </CompanyProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
