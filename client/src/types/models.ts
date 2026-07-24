export type UserRole = 'admin' | 'hr' | 'manager' | 'employee';
export type UserStatus = 'active' | 'inactive' | 'pending' | 'suspended';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  avatar?: string;
  phone?: string;
  dateOfBirth?: string;
  hireDate?: string;
  departmentId?: string;
  branchId?: string;
  managerId?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface Employee {
  id: string;
  employeeId: string;
  userId: string;
  user?: User;
  departmentId: string;
  branchId: string;
  position: string;
  employmentType: 'full-time' | 'part-time' | 'contract' | 'intern';
  hireDate: string;
  salary?: number;
  bankDetails?: BankDetails;
  emergencyContact?: EmergencyContact;
  documents?: Document[];
  createdAt: string;
  updatedAt: string;
}

export interface BankDetails {
  bankName: string;
  accountNumber: string;
  routingNumber: string;
  accountType: 'checking' | 'savings';
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  email?: string;
}

export interface Document {
  id: string;
  name: string;
  type: string;
  url: string;
  uploadedAt: string;
}

export interface Department {
  id: string;
  name: string;
  description?: string;
  managerId?: string;
  manager?: User;
  parentId?: string;
  children?: Department[];
  employeeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: Address;
  phone?: string;
  email?: string;
  managerId?: string;
  manager?: User;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface LeaveType {
  id: string;
  name: string;
  code: string;
  description?: string;
  defaultDays: number;
  isPaid: boolean;
  requiresApproval: boolean;
  color?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Leave {
  id: string;
  employeeId: string;
  employee?: Employee;
  leaveTypeId: string;
  leaveType?: LeaveType;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: LeaveStatus;
  approvedById?: string;
  approvedBy?: User;
  approvedAt?: string;
  rejectedReason?: string;
  createdAt: string;
  updatedAt: string;
}

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface Attendance {
  id: string;
  employeeId: string;
  employee?: Employee;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: AttendanceStatus;
  workHours?: number;
  overtimeHours?: number;
  location?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'half-day' | 'on-leave' | 'holiday';

export interface Payroll {
  id: string;
  employeeId: string;
  employee?: Employee;
  periodStart: string;
  periodEnd: string;
  basicSalary: number;
  allowances: Allowance[];
  deductions: Deduction[];
  grossSalary: number;
  netSalary: number;
  status: PayrollStatus;
  processedAt?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Allowance {
  id: string;
  name: string;
  amount: number;
  isTaxable: boolean;
}

export interface Deduction {
  id: string;
  name: string;
  amount: number;
  isTaxable: boolean;
}

export type PayrollStatus = 'draft' | 'processed' | 'paid' | 'cancelled';

export interface PerformanceReview {
  id: string;
  employeeId: string;
  employee?: Employee;
  reviewerId: string;
  reviewer?: User;
  periodStart: string;
  periodEnd: string;
  status: ReviewStatus;
  overallRating?: number;
  goals: Goal[];
  competencies: Competency[];
  strengths?: string;
  improvements?: string;
  reviewerComments?: string;
  employeeComments?: string;
  createdAt: string;
  updatedAt: string;
}

export type ReviewStatus = 'draft' | 'in-progress' | 'completed' | 'acknowledged';

export interface Goal {
  id: string;
  title: string;
  description?: string;
  weight: number;
  targetDate: string;
  status: GoalStatus;
  progress: number;
  rating?: number;
}

export type GoalStatus = 'not-started' | 'in-progress' | 'completed' | 'cancelled';

export interface Competency {
  id: string;
  name: string;
  description?: string;
  weight: number;
  rating?: number;
  comments?: string;
}

export interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  position: string;
  departmentId?: string;
  source: CandidateSource;
  status: CandidateStatus;
  resumeUrl?: string;
  coverLetter?: string;
  expectedSalary?: number;
  availableFrom?: string;
  notes?: string;
  applications: Application[];
  createdAt: string;
  updatedAt: string;
}

export type CandidateSource = 'website' | 'linkedin' | 'referral' | 'job-board' | 'agency' | 'other';
export type CandidateStatus = 'new' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected' | 'withdrawn';

export interface Application {
  id: string;
  candidateId: string;
  jobId: string;
  job?: Job;
  status: ApplicationStatus;
  appliedAt: string;
  reviewedAt?: string;
  notes?: string;
}

export type ApplicationStatus = 'applied' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected';

export interface Job {
  id: string;
  title: string;
  departmentId: string;
  department?: Department;
  branchId: string;
  branch?: Branch;
  description: string;
  requirements: string;
  responsibilities: string;
  employmentType: 'full-time' | 'part-time' | 'contract' | 'intern';
  experienceLevel: 'entry' | 'junior' | 'mid' | 'senior' | 'lead' | 'principal';
  salaryMin?: number;
  salaryMax?: number;
  currency: string;
  location: string;
  isRemote: boolean;
  status: JobStatus;
  postedAt?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type JobStatus = 'draft' | 'published' | 'closed' | 'filled';

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  relatedEntityType?: string;
  relatedEntityId?: string;
  createdAt: string;
}

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'leave' | 'payroll' | 'performance' | 'recruitment';

export interface Settings {
  id: string;
  key: string;
  value: string;
  description?: string;
  category: SettingsCategory;
  isPublic: boolean;
}

export type SettingsCategory = 'general' | 'payroll' | 'leave' | 'attendance' | 'recruitment' | 'performance' | 'notifications';