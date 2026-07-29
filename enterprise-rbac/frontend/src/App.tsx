import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AuthProvider from './components/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';
import AdminLayout from './layouts/AdminLayout';
import Login from './pages/auth/Login';
import Dashboard from './pages/Dashboard';
import UsersListPage from './pages/users/UsersListPage';
import UserDetailPage from './pages/users/UserDetailPage';
import RolesListPage from './pages/roles/RolesListPage';
import RoleDetailPage from './pages/roles/RoleDetailPage';
import PermissionGroupsPage from './pages/permissions/PermissionGroupsPage';
import CompaniesPage from './pages/organization/CompaniesPage';
import BranchesPage from './pages/organization/BranchesPage';
import LocationsPage from './pages/organization/LocationsPage';
import DepartmentsPage from './pages/organization/DepartmentsPage';
import TeamsPage from './pages/organization/TeamsPage';
import DesignationsPage from './pages/organization/DesignationsPage';
import AuditLogsPage from './pages/audit/AuditLogsPage';
import LoginHistoryPage from './pages/audit/LoginHistoryPage';
import SessionsPage from './pages/audit/SessionsPage';

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<AdminLayout />}>
              <Route index element={<Dashboard />} />

              <Route path="users" element={<UsersListPage />} />
              <Route path="users/:id" element={<UserDetailPage />} />

              <Route path="roles" element={<RolesListPage />} />
              <Route path="roles/:id" element={<RoleDetailPage />} />

              <Route path="permissions" element={<PermissionGroupsPage />} />

              <Route path="organization/companies" element={<CompaniesPage />} />
              <Route path="organization/branches" element={<BranchesPage />} />
              <Route path="organization/locations" element={<LocationsPage />} />
              <Route path="organization/departments" element={<DepartmentsPage />} />
              <Route path="organization/teams" element={<TeamsPage />} />
              <Route path="organization/designations" element={<DesignationsPage />} />

              <Route path="audit/logs" element={<AuditLogsPage />} />
              <Route path="audit/login-history" element={<LoginHistoryPage />} />
              <Route path="audit/sessions" element={<SessionsPage />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
