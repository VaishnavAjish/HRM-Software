import { API_BASE_URL } from '../config/apiUrl';
import { saveToken, loadToken, clearToken, clearUserScopedCaches } from './secureStore';

const BASE_URL = API_BASE_URL;
export { BASE_URL };

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

class ApiService {
  constructor() {
    this.token = null;
    this.tokenType = 'Bearer';
  }

  setToken(token, tokenType = 'Bearer') {
    this.token = token;
    this.tokenType = tokenType || 'Bearer';
  }

  clearToken() {
    this.token = null;
  }

  async request(path, { method = 'GET', body, auth = true, isForm = false } = {}) {
    const headers = { Accept: 'application/json' };
    if (!isForm) headers['Content-Type'] = 'application/json';
    if (auth && this.token) {
      headers.Authorization = `${this.tokenType} ${this.token}`;
    }

    let response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      });
    } catch (e) {
      throw new ApiError('Could not reach the server. Check that you are on the office network.', 0, null);
    }

    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      // No JSON body (e.g. 204/empty response) — fine.
    }

    if (!response.ok) {
      const message = data?.message || `Request failed (${response.status})`;
      throw new ApiError(message, response.status, data);
    }

    return data;
  }

  // ----- Auth -----
  login(email, password) {
    return this.request('/login', { method: 'POST', body: { email, password }, auth: false });
  }

  logout() {
    return this.request('/logout', { method: 'POST' }).catch(() => null);
  }

  // ----- Set Password (first-time / forgot password) -----
  // All 4 steps hit AuthController::newData, which dispatches purely on the
  // `type` field in the body — the URL suffix is cosmetic, kept matching the
  // web client's paths for consistency.
  checkEmpCode(empCode) {
    return this.request(`/check-emp-code/${encodeURIComponent(empCode)}`, { auth: false });
  }

  verifyEmployeeIdentity(formData) {
    return this.request('/new-emp_code', { method: 'POST', body: formData, isForm: true, auth: false });
  }

  sendPasswordResetOtp(payload) {
    const mob = payload.mobile_number || payload.mobile || payload.mobileNumber || payload.email;
    return this.request('/new-email', {
      method: 'POST',
      body: {
        ...payload,
        mobile_number: mob,
        mobile: mob,
        type: 1,
      },
      auth: false,
    });
  }

  verifyPasswordResetOtp(payload) {
    const mob = payload.mobile_number || payload.mobile || payload.mobileNumber || payload.email;
    return this.request('/new-email-otp', {
      method: 'POST',
      body: {
        ...payload,
        mobile_number: mob,
        mobile: mob,
        type: 2,
      },
      auth: false,
    });
  }

  setNewPasswordAfterVerification(payload) {
    const mob = payload.mobile_number || payload.mobile || payload.mobileNumber || payload.email;
    return this.request('/new-password', {
      method: 'POST',
      body: {
        ...payload,
        mobile_number: mob,
        mobile: mob,
        type: 3,
      },
      auth: false,
    });
  }

  sendLoginOtp(mobile) {
    return this.request('/login/otp/send', {
      method: 'POST',
      body: { mobile, mobile_number: mobile },
      auth: false,
    });
  }

  verifyLoginOtp(mobile, otp) {
    return this.request('/login/otp/verify', {
      method: 'POST',
      body: { mobile, mobile_number: mobile, otp },
      auth: false,
    });
  }

  getProfile() {
    return this.request('/profile');
  }

  updateProfile(payload) {
    const isForm = typeof FormData !== 'undefined' && payload instanceof FormData;
    return this.request('/profile-update', { method: 'POST', body: payload, isForm });
  }

  changePassword(payload) {
    return this.request('/change-password', { method: 'POST', body: payload });
  }

  // ----- Authorization -----
  // Read-only permission snapshot the admin portal uses to show/hide its own
  // in-screen actions (e.g. hide "Delete" if the caller can't). Never used to
  // edit roles/policies — that console doesn't exist on mobile.
  getMyPermissions() {
    return this.request('/v1/authorization/me');
  }

  // ----- Admin: Dashboard -----
  getAdminDashboard(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/admin-dashboard${qs ? `?${qs}` : ''}`);
  }

  // ----- Admin: Employees -----
  getAdminEmployees(params = {}) {
    const cleanParams = {};
    Object.keys(params).forEach((key) => {
      if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
        cleanParams[key] = params[key];
      }
    });
    const qs = new URLSearchParams(cleanParams).toString();
    return this.request(`/employee/get${qs ? `?${qs}` : ''}`);
  }

  getAdminEmployee(id) {
    return this.request(`/employee/show/${id}`);
  }

  createEmployee(payload) {
    const isForm = typeof FormData !== 'undefined' && payload instanceof FormData;
    return this.request('/employee/store', { method: 'POST', body: payload, isForm });
  }

  updateEmployee(id, payload) {
    const isForm = typeof FormData !== 'undefined' && payload instanceof FormData;
    return this.request(`/employee/edit/${id}`, { method: 'PUT', body: payload, isForm });
  }

  // Registered as a GET on the backend despite being a delete action — not a
  // mobile-side choice, matching the real route.
  deleteEmployee(id) {
    return this.request(`/employee/delete/${id}`);
  }

  deleteEmployeesBulk(ids) {
    return this.request('/employee/delete-multiple', { method: 'POST', body: { ids } });
  }

  createAccountFromAppointment(payload) {
    return this.request('/appointment/create-account', { method: 'POST', body: payload });
  }

  getEmployeeImportColumns() {
    return this.request('/employee/import-columns');
  }

  importEmployees(formData) {
    return this.request('/employee/import', { method: 'POST', body: formData, isForm: true });
  }

  importEmployeeAccountDetail(formData) {
    return this.request('/employee/import-account-detail', { method: 'POST', body: formData, isForm: true });
  }

  // ----- Admin: Salary -----
  // Same endpoints an employee's own getPayslips()/getPayslipDetail() call —
  // the backend scopes by role automatically (admin sees every employee's
  // slips, filterable by company/unit/month/year/department/search).
  getAdminPayslips(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/salary-slip/get${qs ? `?${qs}` : ''}`);
  }

  getAdminPayslipDetail(id) {
    return this.request(`/salary-slip/show/${id}`);
  }

  // Registered as GET with an `id` query param on the backend, despite being
  // a delete action — not a mobile-side choice, matching the real route.
  deleteAdminPayslip(id) {
    return this.request(`/admin/salary-slip/delete?id=${encodeURIComponent(id)}`);
  }

  getSalaryImportColumns() {
    return this.request('/admin/salary-slip/import-columns');
  }

  importSalarySlips(formData) {
    return this.request('/admin/salary-slip/store', { method: 'POST', body: formData, isForm: true });
  }

  // ----- Admin: Attendance & Shifts -----
  getAttendanceGrid(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/attendance/grid${qs ? `?${qs}` : ''}`);
  }

  upsertAttendanceCell(payload) {
    return this.request('/attendance/cell', { method: 'POST', body: payload });
  }

  getShifts(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/shifts/get${qs ? `?${qs}` : ''}`);
  }

  createShift(payload) {
    return this.request('/shifts/store', { method: 'POST', body: payload });
  }

  updateShift(id, payload) {
    return this.request(`/shifts/update/${id}`, { method: 'PUT', body: payload });
  }

  deleteShift(id) {
    return this.request(`/shifts/delete/${id}`, { method: 'DELETE' });
  }

  assignShift(payload) {
    return this.request('/shifts/assign', { method: 'POST', body: payload });
  }

  // ----- Admin: Appointments -----
  // Distinct from getAgentCandidates() — that one is scoped to the calling
  // agent's own submissions and unpaginated; this is the staff-wide,
  // server-paginated register (role:admin,agent + hr.appointment.read).
  getAdminAppointments(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/appointment${qs ? `?${qs}` : ''}`);
  }

  // ----- Admin: Trial Forms -----
  // Staff-wide (role admin,agent), unpaginated — same shape/scope pattern as
  // getAdminAppointments but the backend never added pagination to this one.
  getAdminTrialForms(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/trial-form/list${qs ? `?${qs}` : ''}`);
  }

  // `checkbox: 1|0` is the trial form's actual approve/un-approve flag —
  // verified against UserController::updateTrialForm's protected-fields list.
  setTrialFormApproval(id, approved) {
    const fd = new FormData();
    fd.append('checkbox', approved ? '1' : '0');
    return this.updateTrialForm(id, fd);
  }

  // Admin-only (role:admin, permission recruitment.trial_form.delete) —
  // distinct from an agent deleting their own draft, which this app doesn't
  // expose today.
  deleteTrialForm(id) {
    return this.request(`/trial-form/delete/${id}`, { method: 'DELETE' });
  }

  deleteAppointment(id) {
    return this.request(`/appointment/delete/${id}`, { method: 'DELETE' });
  }

  // ----- Admin: Accounts (Super-Admin only in practice) -----
  getAdminAccounts(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/rbac/user-roles${qs ? `?${qs}` : ''}`);
  }

  createAdminAccount(payload) {
    return this.request('/register', { method: 'POST', body: payload });
  }

  // ----- Admin: Tickets -----
  // Same rows/endpoint as getTickets() (employee self-service) — the backend
  // scopes what's visible by role, this just omits the `mine: true` default
  // so admin sees the full queue rather than only their own assigned tickets.
  getAdminTickets(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/tickets/get${qs ? `?${qs}` : ''}`);
  }

  getTicketAssignees() {
    return this.request('/tickets/assignees');
  }

  assignTicket(id, payload) {
    return this.request(`/tickets/${id}/assign`, { method: 'PUT', body: payload });
  }

  updateTicketStatus(id, status, remarks) {
    return this.request(`/tickets/${id}/status`, { method: 'PUT', body: { status, remarks } });
  }

  escalateTicket(id, remarks) {
    return this.request(`/tickets/${id}/escalate`, { method: 'POST', body: { remarks } });
  }

  // ----- Admin: Upload Batches (shared history for employee/salary/attendance bulk imports) -----
  getUploadBatches(type, params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/upload-batches/${type}${qs ? `?${qs}` : ''}`);
  }

  getUploadBatchDetail(type, id) {
    return this.request(`/upload-batches/${type}/${id}`);
  }

  deleteUploadBatch(type, id) {
    return this.request(`/upload-batches/${type}/${id}`, { method: 'DELETE' });
  }

  // ----- Employee -----
  getDashboard() {
    return this.request('/dashboard');
  }

  getPayslips(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/salary-slip/get${qs ? `?${qs}` : ''}`);
  }

  getPayslipDetail(id) {
    return this.request(`/salary-slip/show/${id}`);
  }

  // ----- Agent -----
  getAgentCandidates() {
    return this.request('/agent/candidates');
  }

  getDepartments() {
    return this.request('/department/get');
  }

  submitAppointment(formData) {
    return this.request('/appointment', { method: 'POST', body: formData, isForm: true });
  }

  updateAppointment(formData) {
    return this.request('/appointment/update', { method: 'POST', body: formData, isForm: true });
  }

  submitTrialForm(formData) {
    return this.request('/trial-form/store', { method: 'POST', body: formData, isForm: true });
  }

  updateTrialForm(id, formData) {
    return this.request(`/trial-form/update/${id}`, { method: 'POST', body: formData, isForm: true });
  }

  // ----- Tickets (shared, any role) -----
  getTicketCategories() {
    return this.request('/tickets/categories');
  }

  getTickets(params = {}) {
    const qs = new URLSearchParams({ mine: 'true', ...params }).toString();
    return this.request(`/tickets/get${qs ? `?${qs}` : ''}`);
  }

  getTicket(id) {
    return this.request(`/tickets/show/${id}`);
  }

  createTicket(payload) {
    return this.request('/tickets/store', { method: 'POST', body: payload });
  }

  replyTicket(id, message) {
    return this.request(`/tickets/${id}/reply`, { method: 'POST', body: { message } });
  }

  reopenTicket(id, reason) {
    return this.request(`/tickets/${id}/reopen`, { method: 'POST', body: { reason } });
  }

  // A ticket must exist before files can be attached to it — this is a
  // separate multipart endpoint, not part of tickets/store.
  uploadTicketAttachments(ticketId, assets) {
    const fd = new FormData();
    assets.forEach((asset, i) => {
      fd.append('files[]', {
        uri: asset.uri,
        name: asset.fileName || `attachment-${Date.now()}-${i}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });
    });
    return this.request(`/tickets/${ticketId}/attachments`, { method: 'POST', body: fd, isForm: true });
  }

  // Attachment download is an authenticated stream, not a public URL — pair
  // with authHeaders() when passing this to <Image source={{ uri, headers }}>.
  getTicketAttachmentUrl(ticketId, attachmentId) {
    return `${BASE_URL}/tickets/${ticketId}/attachments/${attachmentId}`;
  }

  authHeaders() {
    return this.token ? { Authorization: `${this.tokenType} ${this.token}` } : {};
  }

  // ----- Notifications (shared, any role) -----
  // The feed is gated behind `module.schema:notifications` server-side, so it
  // 503s on an environment where that table hasn't been migrated. Callers treat
  // a failure as "no server notifications" rather than an error state.
  getNotifications(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/notifications${qs ? `?${qs}` : ''}`);
  }

  getUnreadNotificationCount() {
    return this.request('/notifications/unread-count');
  }

  markNotificationRead(id) {
    return this.request(`/notifications/${id}/read`, { method: 'POST' });
  }

  markAllNotificationsRead() {
    return this.request('/notifications/read-all', { method: 'POST' });
  }

  deleteNotification(id) {
    return this.request(`/notifications/${id}`, { method: 'DELETE' });
  }
}

export const api = new ApiService();

// Only the JWT + token type are persisted, and only in the device keystore
// (SecureStore). The user object is never persisted — it is re-fetched from the
// protected profile endpoint on every cold start (see AuthContext).
export async function persistSession(session) {
  await saveToken(session.token, session.tokenType);
}

export async function loadPersistedSession() {
  return loadToken();
}

export async function clearPersistedSession() {
  await clearToken();
  await clearUserScopedCaches();
}
