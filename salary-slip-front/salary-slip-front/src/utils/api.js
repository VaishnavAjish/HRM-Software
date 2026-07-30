import { baseUrl } from "./url";
import {
  resolveCompanyIds,
  resolveCompanyScope,
} from "../config/companyConfig";
async function apiRequest(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = isFormData
    ? { Accept: "application/json", ...options.headers }
    : {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      };

  const response = await fetch(`${baseUrl}/api${path}`, {
    ...options,
    headers,
    // Without this, GET requests can be served from the HTTP cache instead
    // of hitting the network — barely noticeable on desktop Chrome, but the
    // Android WebView the mobile app runs in caches GETs more aggressively,
    // which is why a freshly-added trial form or a just-assigned emp_code
    // wouldn't show up anywhere until a full reload forced a real refetch.
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok || data?.success === false || data?.status === false) {
    const message =
      data?.message || data?.error || "Something went wrong. Please try again.";
    const error = new Error(message);
    error.status = response.status;
    error.data = data;

    // Only an already-authenticated request whose token got rejected counts
    // as a session expiring — a plain login attempt with a wrong password is
    // also a 401 but carries no Authorization header, so it's excluded here.
    if (response.status === 401 && headers.Authorization) {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    }

    throw error;
  }

  return data;
}

function buildCompanyQuery(companyId) {
  const scope = resolveCompanyScope(companyId);
  const resolved = resolveCompanyIds(scope.companyId);
  const query = resolved.length > 0 ? { company_code: resolved.join(",") } : {};

  if (scope.unit) {
    query.unit = scope.unit;
  }

  return query;
}

function mergeCompanyFilters(filters = {}, companyId) {
  return {
    ...filters,
    ...buildCompanyQuery(companyId),
  };
}

function resolveWriteCompanyId(companyId, fallbackCompanyId) {
  return resolveCompanyIds(
    resolveCompanyScope(companyId).companyId,
    fallbackCompanyId,
  )[0];
}

export const salaryApi = {
  getSlips(
    accessToken,
    tokenType = "Bearer",
    page = 1,
    limit = 15,
    filters = {},
    companyId,
  ) {
    const params = new URLSearchParams({ page, limit });
    Object.entries(mergeCompanyFilters(filters, companyId)).forEach(
      ([key, value]) => {
        if (!value) return;
        params.set(key, value);
      },
    );
    return apiRequest(`/salary-slip/get?${params}`, {
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  getAllSlips(accessToken, tokenType = "Bearer", filters = {}, companyId) {
    const params = new URLSearchParams({ no_pagination: 1 });
    Object.entries(mergeCompanyFilters(filters, companyId)).forEach(
      ([key, value]) => {
        if (!value) return;
        params.set(key, value);
      },
    );
    return apiRequest(`/salary-slip/get?${params}`, {
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  getEmployees(
    accessToken,
    tokenType = "Bearer",
    page = 1,
    limit = 15,
    filters = {},
    companyId,
  ) {
    const params = new URLSearchParams({ page, limit });
    Object.entries(mergeCompanyFilters(filters, companyId)).forEach(
      ([key, value]) => {
        if (!value) return;
        if (key === "status") {
          if (value === "Active" || value === "0") {
            params.set("status", "0");
          } else if (value === "Pending" || value === "2") {
            params.set("status", "2");
          } else {
            params.set("status", "1");
          }
        } else {
          params.set(key, value);
        }
      },
    );
    return apiRequest(`/employee/get?${params}`, {
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  getAllEmployees(accessToken, tokenType = "Bearer", filters = {}, companyId) {
    const params = new URLSearchParams();
    Object.entries(mergeCompanyFilters(filters, companyId)).forEach(
      ([key, value]) => {
        if (!value) return;
        if (key === "status") {
          if (value === "Active" || value === "0") {
            params.set("status", "0");
          } else if (value === "Pending" || value === "2") {
            params.set("status", "2");
          } else {
            params.set("status", "1");
          }
        } else {
          params.set(key, value);
        }
      },
    );
    return apiRequest(`/employee/get?${params}`, {
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  getEmployee(id, accessToken, tokenType = "Bearer", companyId) {
    const params = new URLSearchParams(buildCompanyQuery(companyId));
    const query = params.toString() ? `?${params}` : "";
    return apiRequest(`/employee/show/${id}${query}`, {
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  storeEmployee(payload, accessToken, tokenType = "Bearer", companyId) {
    return apiRequest("/employee/store", {
      method: "POST",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
      body: JSON.stringify({
        ...payload,
        company_code: payload.company_code !== undefined ? payload.company_code : resolveWriteCompanyId(companyId, payload?.company_code),
      }),
    });
  },

  editEmployee(id, payload, accessToken, tokenType = "Bearer", companyId) {
    return apiRequest(`/employee/edit/${id}`, {
      method: "PUT",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
      body: JSON.stringify({
        ...payload,
        company_code: payload.company_code !== undefined ? payload.company_code : resolveWriteCompanyId(companyId, payload?.company_code),
      }),
    });
  },

  deleteEmployee(id, accessToken, tokenType = "Bearer", companyId) {
    const params = new URLSearchParams(buildCompanyQuery(companyId));
    const query = params.toString() ? `?${params}` : "";
    return apiRequest(`/employee/delete/${id}${query}`, {
      method: "GET",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  getDepartments(accessToken, tokenType = "Bearer", companyCode = null) {
    const query = (companyCode && companyCode !== "all-companies") ? `?company_code=${companyCode}` : "";
    return apiRequest(`/department/get${query}`, {
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  storeDepartment(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/department/store", {
      method: "POST",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
      body: JSON.stringify(payload),
    });
  },

  updateDepartment(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/department/update/${id}`, {
      method: "PUT",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
      body: JSON.stringify(payload),
    });
  },

  deleteDepartment(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/department/delete/${id}`, {
      method: "DELETE",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  getEmployeeImportColumns(accessToken, tokenType = "Bearer") {
    return apiRequest("/employee/import-columns", {
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  getSlipDetail(id, accessToken, tokenType = "Bearer", companyId) {
    const params = new URLSearchParams(buildCompanyQuery(companyId));
    const query = params.toString() ? `?${params}` : "";
    return apiRequest(`/salary-slip/show/${id}${query}`, {
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  deleteSlip(id, accessToken, tokenType = "Bearer") {
    const params = new URLSearchParams({
      id,
    });
    return apiRequest(`/admin/salary-slip/delete?${params}`, {
      method: "GET",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  uploadSalarySlip(
    file,
    accessToken,
    tokenType = "Bearer",
    companyId,
    unit = "",
    mapping = {},
  ) {
    const formData = new FormData();
    formData.append("salary_slip", file);
    formData.append("company_code", resolveWriteCompanyId(companyId));
    formData.append("unit", unit || "");
    if (mapping && Object.keys(mapping).length > 0) {
      formData.append("mapping", JSON.stringify(mapping));
    }
    return apiRequest("/admin/salary-slip/store", {
      method: "POST",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
      body: formData,
    });
  },

  uploadAccountMaster(file, accessToken, tokenType = "Bearer", companyScope) {
    const scope = resolveCompanyScope(companyScope);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("company_code", resolveWriteCompanyId(scope.companyId));
    formData.append("unit", scope.unit || "");

    return apiRequest("/account-master", {
      method: "POST",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
      body: formData,
    });
  },

  getAdminDashboard(
    accessToken,
    tokenType = "Bearer",
    companyId,
    filters = {},
  ) {
    const params = new URLSearchParams(mergeCompanyFilters(filters, companyId));
    const query = params.toString() ? `?${params}` : "";
    return apiRequest(`/admin-dashboard${query}`, {
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  getEmployeeDashboard(accessToken, tokenType = "Bearer", companyId) {
    const params = new URLSearchParams(buildCompanyQuery(companyId));
    const query = params.toString() ? `?${params}` : "";
    return apiRequest(`/dashboard${query}`, {
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  // Recent-uploads history + pass/fail report, shared by the salary-slip,
  // employee, and account-master bulk-upload flows (type distinguishes them).
  getUploadBatches(type, accessToken, tokenType = "Bearer", companyId, page = 1, limit = 15) {
    const params = new URLSearchParams({ page, limit, ...buildCompanyQuery(companyId) });
    return apiRequest(`/upload-batches/${type}?${params}`, {
      headers: accessToken ? { Authorization: `${tokenType} ${accessToken}` } : {},
    });
  },

  getUploadBatch(type, id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/upload-batches/${type}/${id}`, {
      headers: accessToken ? { Authorization: `${tokenType} ${accessToken}` } : {},
    });
  },

  deleteUploadBatch(type, id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/upload-batches/${type}/${id}`, {
      method: "DELETE",
      headers: accessToken ? { Authorization: `${tokenType} ${accessToken}` } : {},
    });
  },

  getAttendanceGrid(accessToken, tokenType = "Bearer", { companyId, unit, month, year } = {}) {
    const params = new URLSearchParams({
      company_code: resolveWriteCompanyId(companyId),
      month,
      year,
    });
    if (unit) params.set("unit", unit);
    return apiRequest(`/attendance/grid?${params}`, {
      headers: accessToken ? { Authorization: `${tokenType} ${accessToken}` } : {},
    });
  },

  updateAttendanceCell(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/attendance/cell", {
      method: "POST",
      headers: accessToken ? { Authorization: `${tokenType} ${accessToken}` } : {},
      body: JSON.stringify(payload),
    });
  },

  importAttendance(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/attendance/import", {
      method: "POST",
      headers: accessToken ? { Authorization: `${tokenType} ${accessToken}` } : {},
      body: JSON.stringify(payload),
    });
  },

  getShifts(accessToken, tokenType = "Bearer", { companyId, unit } = {}) {
    const params = new URLSearchParams();
    if (companyId) params.set("company_code", resolveWriteCompanyId(companyId));
    if (unit) params.set("unit", unit);
    const query = params.toString() ? `?${params}` : "";
    return apiRequest(`/shifts/get${query}`, {
      headers: accessToken ? { Authorization: `${tokenType} ${accessToken}` } : {},
    });
  },

  createShift(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/shifts/store", {
      method: "POST",
      headers: accessToken ? { Authorization: `${tokenType} ${accessToken}` } : {},
      body: JSON.stringify(payload),
    });
  },

  updateShift(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/shifts/update/${id}`, {
      method: "PUT",
      headers: accessToken ? { Authorization: `${tokenType} ${accessToken}` } : {},
      body: JSON.stringify(payload),
    });
  },

  deleteShift(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/shifts/delete/${id}`, {
      method: "DELETE",
      headers: accessToken ? { Authorization: `${tokenType} ${accessToken}` } : {},
    });
  },

  assignShift(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/shifts/assign", {
      method: "POST",
      headers: accessToken ? { Authorization: `${tokenType} ${accessToken}` } : {},
      body: JSON.stringify(payload),
    });
  },
};

export const roleApi = {
  getRoles(accessToken, tokenType = "Bearer") {
    return apiRequest("/roles/get", {
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  getPermissionGroups(accessToken, tokenType = "Bearer") {
    return apiRequest("/roles/permissions", {
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  getRole(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/roles/show/${id}`, {
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  storeRole(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/roles/store", {
      method: "POST",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
      body: JSON.stringify(payload),
    });
  },

  updateRole(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/roles/update/${id}`, {
      method: "PUT",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
      body: JSON.stringify(payload),
    });
  },

  deleteRole(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/roles/delete/${id}`, {
      method: "DELETE",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  getMatrix(accessToken, tokenType = "Bearer") {
    return apiRequest("/roles/matrix", {
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  updateMatrix(roleId, permissionIds, accessToken, tokenType = "Bearer") {
    return apiRequest("/roles/matrix", {
      method: "PUT",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
      body: JSON.stringify({ role_id: roleId, permission_ids: permissionIds }),
    });
  },
};

function authHeaders(accessToken, tokenType) {
  return accessToken ? { Authorization: `${tokenType} ${accessToken}` } : {};
}

export const rbacApi = {
  getMyPermissions(accessToken, tokenType = "Bearer") {
    return apiRequest("/my-permissions", { headers: authHeaders(accessToken, tokenType) });
  },

  getDashboard(accessToken, tokenType = "Bearer") {
    return apiRequest("/rbac/dashboard", { headers: authHeaders(accessToken, tokenType) });
  },

  getAuditLogs(accessToken, tokenType = "Bearer", page = 1, limit = 25, filters = {}) {
    const params = new URLSearchParams({ page, limit, ...filters });
    return apiRequest(`/rbac/audit-logs?${params}`, { headers: authHeaders(accessToken, tokenType) });
  },

  getSettings(accessToken, tokenType = "Bearer", group = "rbac") {
    return apiRequest(`/rbac/settings?group=${group}`, { headers: authHeaders(accessToken, tokenType) });
  },

  updateSettings(settings, accessToken, tokenType = "Bearer", group = "rbac") {
    return apiRequest(`/rbac/settings?group=${group}`, {
      method: "PUT",
      headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify({ settings }),
    });
  },

  getUserRoles(accessToken, tokenType = "Bearer", page = 1, limit = 15, search = "", roleFilter = "") {
    const params = new URLSearchParams({
      page,
      limit,
      ...(search ? { search } : {}),
      ...(roleFilter ? { role: roleFilter } : {}),
    });
    return apiRequest(`/rbac/user-roles?${params}`, { headers: authHeaders(accessToken, tokenType) });
  },

  getDimensionRoles(dimension, accessToken, tokenType = "Bearer") {
    return apiRequest(`/rbac/permission-dimensions/${dimension}/roles`, {
      headers: authHeaders(accessToken, tokenType),
    });
  },

  getDimension(dimension, accessToken, tokenType = "Bearer", roleId) {
    const params = roleId ? `?role_id=${roleId}` : "";
    return apiRequest(`/rbac/permission-dimensions/${dimension}${params}`, {
      headers: authHeaders(accessToken, tokenType),
    });
  },

  storeDimension(dimension, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/rbac/permission-dimensions/${dimension}`, {
      method: "POST",
      headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  removeDimension(dimension, id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/rbac/permission-dimensions/${dimension}/${id}`, {
      method: "DELETE",
      headers: authHeaders(accessToken, tokenType),
    });
  },
};

export const documentApi = {
  // Catalogue for the Document Type selector, grouped by category.
  getTypes(accessToken, tokenType = "Bearer") {
    return apiRequest("/documents/types", { headers: authHeaders(accessToken, tokenType) });
  },

  // Filename the server WOULD generate — shown before the user confirms.
  // The server recomputes it on upload, so this is display-only.
  previewName({ userId, documentType, fileName }, accessToken, tokenType = "Bearer") {
    return apiRequest("/documents/preview-name", {
      method: "POST",
      headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify({
        user_id: userId ?? null,
        document_type: documentType,
        file_name: fileName,
      }),
    });
  },

  upload({ userId, documentType, file }, accessToken, tokenType = "Bearer") {
    const formData = new FormData();
    if (userId) formData.append("user_id", userId);
    formData.append("document_type", documentType);
    formData.append("file", file);

    return apiRequest("/documents", {
      method: "POST",
      headers: authHeaders(accessToken, tokenType),
      body: formData,
    });
  },

  // filters: search, user_id, emp_code, document_type, category, version, from, to, all_versions
  search(filters = {}, accessToken, tokenType = "Bearer") {
    const params = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== ""),
    );
    return apiRequest(`/documents?${params}`, { headers: authHeaders(accessToken, tokenType) });
  },

  remove(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/documents/${id}`, {
      method: "DELETE",
      headers: authHeaders(accessToken, tokenType),
    });
  },
};

/**
 * S3-backed document API (v1).
 *
 * Presigned URLs returned here are short-lived and must never be persisted —
 * no localStorage, no cache, no redux. Request a fresh one per view/download.
 */
/**
 * Appointment Details save-first flow. The record is created/updated before any
 * document is uploaded, so the upload step always has a real database id.
 */
export const appointmentV1Api = {
  create(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/appointments", {
      method: "POST",
      headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  update(appointmentId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/appointments/${appointmentId}`, {
      method: "PUT",
      headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  // Powers refresh recovery — the form reloads itself from the saved record.
  get(appointmentId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/appointments/${appointmentId}`, {
      headers: authHeaders(accessToken, tokenType),
    });
  },

  complete(appointmentId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/appointments/${appointmentId}/complete`, {
      method: "POST",
      headers: authHeaders(accessToken, tokenType),
    });
  },

  /**
   * The complete Aadhaar number, for an explicitly authorised user only.
   *
   * POST, not GET: the response carries sensitive data and must not be cached,
   * prefetched or land in a history entry. The caller must keep the value in
   * component state only — never in a store, storage or the URL.
   */
  revealAadhaar(appointmentId, accessToken, tokenType = "Bearer", context = "VIEW") {
    return apiRequest(`/v1/appointments/${appointmentId}/aadhaar/reveal`, {
      method: "POST",
      headers: {
        ...authHeaders(accessToken, tokenType),
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      // VIEW | PRINT | PDF — the server re-authorises and audits each context
      // under its own action name.
      body: JSON.stringify({ context }),
    });
  },

  // Scoped to the appointment, not the employee: one person can hold several
  // appointments, and historical records share Aadhaar numbers, so an
  // employee-level list would mix unrelated documents together.
  listDocuments(appointmentId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/appointments/${appointmentId}/documents`, {
      headers: authHeaders(accessToken, tokenType),
    });
  },

  // Only file + documentType. The Aadhaar number is read server-side from the
  // appointment record and must never be sent from here.
  uploadDocument(appointmentId, { file, documentType, idempotencyKey }, accessToken, tokenType = "Bearer") {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("documentType", documentType);

    return apiRequest(`/v1/appointments/${appointmentId}/documents`, {
      method: "POST",
      headers: {
        ...authHeaders(accessToken, tokenType),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: formData,
    });
  },
};

export const documentV1Api = {
  getTypes(accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/documents/types", { headers: authHeaders(accessToken, tokenType) });
  },

  health(accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/documents/health", { headers: authHeaders(accessToken, tokenType) });
  },

  // filters: page, pageSize, search, employeeId, documentType, status,
  //          from, to, sortBy, sortOrder, includeDeleted
  list(filters = {}, accessToken, tokenType = "Bearer") {
    const params = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== ""),
    );
    return apiRequest(`/v1/documents?${params}`, { headers: authHeaders(accessToken, tokenType) });
  },

  get(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/documents/${id}`, { headers: authHeaders(accessToken, tokenType) });
  },

  versions(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/documents/${id}/versions`, { headers: authHeaders(accessToken, tokenType) });
  },

  // idempotencyKey makes a retried upload return the original version instead
  // of creating a duplicate one.
  upload({ file, documentType, employeeId, description, idempotencyKey }, accessToken, tokenType = "Bearer") {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("documentType", documentType);
    if (employeeId) formData.append("employeeId", employeeId);
    if (description) formData.append("description", description);

    return apiRequest("/v1/documents/upload", {
      method: "POST",
      headers: {
        ...authHeaders(accessToken, tokenType),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: formData,
    });
  },

  replace({ id, file, idempotencyKey }, accessToken, tokenType = "Bearer") {
    const formData = new FormData();
    formData.append("file", file);

    return apiRequest(`/v1/documents/${id}/replace`, {
      method: "POST",
      headers: {
        ...authHeaders(accessToken, tokenType),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: formData,
    });
  },

  // Always fetched fresh at the moment of use — never stored.
  viewUrl(id, versionId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/documents/${id}/view-url`, {
      method: "POST",
      headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify({ versionId: versionId ?? null }),
    });
  },

  downloadUrl(id, versionId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/documents/${id}/download-url`, {
      method: "POST",
      headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify({ versionId: versionId ?? null }),
    });
  },

  remove(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/documents/${id}`, {
      method: "DELETE",
      headers: authHeaders(accessToken, tokenType),
    });
  },

  restore(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/documents/${id}/restore`, {
      method: "POST",
      headers: authHeaders(accessToken, tokenType),
    });
  },
};

export const authApi = {
  register(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/register", {
      method: "POST",
      headers: accessToken ? { Authorization: `${tokenType} ${accessToken}` } : {},
      body: JSON.stringify(payload),
    });
  },

  login(email, password, company_code) {
    return apiRequest("/login", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        ...(company_code ? { company_code } : {}),
      }),
    });
  },

  buildScopedResetPayload(companyId, unit, payload = {}) {
    const scope = resolveCompanyScope({ companyId, unit });

    return {
      ...payload,
      company_code: scope.companyId,
      unit: scope.unit || "",
    };
  },

  logout(accessToken, tokenType = "Bearer") {
    return apiRequest("/logout", {
      method: "POST",
      headers: accessToken
        ? {
            Authorization: `${tokenType} ${accessToken}`,
          }
        : {},
    });
  },

  checkEmpCode(empCode) {
    return apiRequest(`/check-emp-code/${empCode}`, {
      method: "GET",
    });
  },

  verifyEmpCode(empCode, companyId, unit, details = {}) {
    const payload = this.buildScopedResetPayload(companyId, unit, {
      emp_code: empCode,
      mobile_number: details.mob_num,
      dob: details.dob,
      address: details.address,
      type: 0,
    });

    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null) formData.append(key, value);
    });
    if (details.photo) formData.append("photo", details.photo);

    return apiRequest("/new-emp_code", {
      method: "POST",
      body: formData,
    });
  },

  // `extra` carries emp_code/verification_token/company_code/unit from a
  // preceding verifyEmpCode() call — the backend uses those to resolve the
  // already-identity-verified employee and let them claim this email even
  // when they don't have one on file yet (first-time registration).
  verifyEmail(email, extra = {}) {
    return apiRequest("/new-email", {
      method: "POST",
      body: JSON.stringify({
        email,
        type: 1,
        ...extra,
      }),
    });
  },

  verifyEmailOtp(email, otp) {
    return apiRequest("/new-email-otp", {
      method: "POST",
      body: JSON.stringify({
        email,
        otp,
        type: 2,
      }),
    });
  },

  setNewPassword(password, email) {
    return apiRequest("/new-password", {
      method: "POST",
      body: JSON.stringify({
        password,
        email,
        type: 3,
      }),
    });
  },

  changePassword(
    accessToken,
    tokenType = "Bearer",
    currentPassword,
    newPassword,
    confirmPassword,
  ) {
    return apiRequest("/change-password", {
      method: "POST",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
      body: JSON.stringify({
        password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      }),
    });
  },

  getProfile(accessToken, tokenType = "Bearer") {
    return apiRequest("/profile", {
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  importEmployees(
    file,
    accessToken,
    tokenType = "Bearer",
    companyId,
    mapping = {},
  ) {
    const scope = resolveCompanyScope(companyId);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("company_code", resolveWriteCompanyId(scope.companyId));
    if (scope.unit) {
      formData.append("unit", scope.unit);
    }
    if (mapping && Object.keys(mapping).length > 0) {
      formData.append("mapping", JSON.stringify(mapping));
    }
    return apiRequest("/employee/import", {
      method: "POST",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
      body: formData,
    });
  },

  importEmployeeRows(
    rows,
    accessToken,
    tokenType = "Bearer",
    companyId,
    unit,
  ) {
    const scope = resolveCompanyScope(companyId);
    return apiRequest("/employee/import", {
      method: "POST",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
      body: JSON.stringify({
        rows,
        company_code: resolveWriteCompanyId(scope.companyId),
        unit: unit || scope.unit || "",
      }),
    });
  },

  updateProfile(payload, accessToken, tokenType = "Bearer") {
    const headers = accessToken
      ? { Authorization: `${tokenType} ${accessToken}` }
      : {};

    if (payload?.photo instanceof File) {
      const formData = new FormData();
      Object.entries(payload).forEach(([key, value]) => {
        if (value !== undefined && value !== null) formData.append(key, value);
      });

      return apiRequest("/profile-update", {
        method: "POST",
        headers,
        body: formData,
      });
    }

    return apiRequest("/profile-update", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  },

  createCandidateAccount(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/appointment/create-account", {
      method: "POST",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
      body: payload instanceof FormData ? payload : JSON.stringify(payload),
    });
  },

  getAgents(accessToken, tokenType = "Bearer", companyScope = null) {
    const params = new URLSearchParams();
    if (companyScope?.companyId && companyScope.companyId !== "all-companies") {
      params.append("company_code", companyScope.companyId);
    }
    const qs = params.toString() ? `?${params.toString()}` : "";
    return apiRequest(`/agents${qs}`, {
      method: "GET",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  updateAgent(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/agents/${id}`, {
      method: "PUT",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
      body: JSON.stringify(payload),
    });
  },

  deleteAgent(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/agents/${id}`, {
      method: "DELETE",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  submitAppointmentForm(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/appointment", {
      method: "POST",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
      body: payload,
    });
  },

  getAgentCandidates(accessToken, tokenType = "Bearer") {
    return apiRequest("/agent/candidates", {
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  getAppointmentForms(accessToken, tokenType = "Bearer", companyId) {
    const params = new URLSearchParams(buildCompanyQuery(companyId));
    const query = params.toString() ? `?${params}` : "";

    return apiRequest(`/appointment${query}`, {
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  updateAppointment(payload, accessToken, tokenType = "Bearer") {
    const isForm = payload instanceof FormData;
    return apiRequest(`/appointment/update`, {
      method: "POST",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
      body: isForm ? payload : JSON.stringify(payload),
    });
  },

  checkEmpCodeAvailability(empCode, excludeId, accessToken, tokenType = "Bearer") {
    const params = new URLSearchParams({ emp_code: empCode });
    if (excludeId) params.set("exclude_id", excludeId);
    return apiRequest(`/appointment/check-emp-code?${params}`, {
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  submitTrialForm(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/trial-form/store", {
      method: "POST",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
      body: payload,
    });
  },

  getTrialForms(accessToken, tokenType = "Bearer", companyId) {
    const params = new URLSearchParams(buildCompanyQuery(companyId));
    const query = params.toString() ? `?${params}` : "";

    return apiRequest(`/trial-form/list${query}`, {
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },

  updateTrialForm(id, payload, accessToken, tokenType = "Bearer") {
    const isForm = payload instanceof FormData;
    return apiRequest(`/trial-form/update/${id}`, {
      method: "POST",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
      body: isForm ? payload : JSON.stringify(payload),
    });
  },

  deleteTrialForm(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/trial-form/delete/${id}`, {
      method: "DELETE",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
    });
  },
};
