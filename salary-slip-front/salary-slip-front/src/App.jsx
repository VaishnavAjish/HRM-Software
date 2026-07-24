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

import Login from "./pages/auth/Login";
import AppLayout from "./components/layout/AppLayout";

// Admin pages
import AdminDashboard from "./pages/admin/Dashboard";
import EmployeeManagement from "./pages/admin/EmployeeManagement";
import SalaryManagement from "./pages/admin/SalaryManagement";
import Appointments from "./pages/admin/Appointments";
import TrialForm from "./pages/admin/TrialForm";
import Reports from "./pages/admin/Reports";
import AdminForm16 from "./pages/admin/Form16";
import AdminProfile from "./pages/admin/AdminProfile";

// Employee pages
import EmployeeDashboard from "./pages/employee/Dashboard";
import Payslips from "./pages/employee/Payslips";
import EmployeeForm16 from "./pages/employee/Form16";
import Profile from "./pages/employee/Profile";

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

function ProtectedRoute({ children, requiredRole }) {
  const location = useLocation();
  const { user, initializing, isAuthenticated } = useAuth();

  if (initializing) return <RouteLoader />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (requiredRole && user.role !== requiredRole) {
    return (
      <Navigate to={user.role === "admin" ? "/admin" : "/employee"} replace />
    );
  }
  return children;
}

function AppRoutes() {
  const { user, initializing, isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          initializing ? (
            <RouteLoader />
          ) : isAuthenticated ? (
            <Navigate to={user.role === "admin" ? "/admin" : "/employee"} />
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
        <Route path="salary" element={<SalaryManagement />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="trial-form" element={<TrialForm />} />
        <Route path="form16" element={<AdminForm16 />} />
        <Route path="reports" element={<Reports />} />
        <Route path="profile" element={<AdminProfile />} />
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
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
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
