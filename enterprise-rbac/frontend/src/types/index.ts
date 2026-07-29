export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description?: string | null;
  groupId?: string | null;
  group?: PermissionGroup | null;
}

export interface PermissionGroup {
  id: string;
  name: string;
  description?: string | null;
  permissions?: Permission[];
}

export interface Role {
  id: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  createdAt: string;
  permissions: { permissionId: string; permission: Permission }[];
  users?: { userId: string; user: { id: string; fullName: string; username: string; email: string } }[];
}

export interface Company {
  id: string;
  name: string;
  code: string;
  currency: string;
  createdAt: string;
}

export interface Branch {
  id: string;
  companyId: string;
  name: string;
  code: string;
  company?: Company;
}

export interface Location {
  id: string;
  branchId: string;
  name: string;
  type: string;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  address?: string | null;
  branch?: Branch;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  headId?: string | null;
}

export interface Team {
  id: string;
  departmentId: string;
  name: string;
  department?: Department;
}

export interface Designation {
  id: string;
  title: string;
  level: number;
}

export interface AppUser {
  id: string;
  empId?: string | null;
  empCode?: string | null;
  fullName: string;
  username: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  joiningDate?: string | null;
  terminationDate?: string | null;
  managerId?: string | null;
  manager?: { id: string; fullName: string; username: string } | null;
  designationId?: string | null;
  departmentId?: string | null;
  teamId?: string | null;
  companyId?: string | null;
  branchId?: string | null;
  locationId?: string | null;
  timezone: string;
  language: string;
  empType?: string | null;
  mfaEnabled: boolean;
  failedAttempts: number;
  lockedUntil?: string | null;
  lastLogin?: string | null;
  createdAt: string;
  roles: { roleId: string; role: Role }[];
  permissions?: { permissionId: string; permission: Permission; isRevoked: boolean }[];
  designation?: Designation | null;
  department?: Department | null;
  team?: Team | null;
  company?: Company | null;
  branch?: Branch | null;
  location?: Location | null;
}

export interface AuthUser extends Omit<AppUser, 'roles' | 'permissions'> {
  roles: string[];
  permissions: string[];
}

export interface AuditLog {
  id: string;
  userId?: string | null;
  action: string;
  resource: string;
  resourceId: string;
  oldValues?: unknown;
  newValues?: unknown;
  ipAddress?: string | null;
  timestamp: string;
  user?: { id: string; fullName: string; username: string } | null;
}

export interface LoginHistoryEntry {
  id: string;
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  status: 'SUCCESS' | 'FAILED' | 'LOCKED';
  timestamp: string;
  user?: { id: string; fullName: string; username: string } | null;
}

export interface SessionEntry {
  id: string;
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceInfo?: string | null;
  expiresAt: string;
  isRevoked: boolean;
  createdAt: string;
  user?: { id: string; fullName: string; username: string } | null;
}

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalRoles: number;
  totalPermissionGroups: number;
  totalCompanies: number;
  totalBranches: number;
  recentActivity: AuditLog[];
}
