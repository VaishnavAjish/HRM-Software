import { baseUrl } from "./url";
import {
  resolveCompanyIds,
  resolveCompanyScope,
} from "../config/companyConfig";
import { Capacitor, CapacitorHttp } from '@capacitor/core';

// Two response shapes exist across the API: the original `{ message }` /
// `{ error: "string" }`, and the newer v1 document/appointment endpoints'
// `{ error: { code, message, details } }` (see DocumentException::toArray()).
// Without this, an object `error` got passed straight into `new Error(...)`,
// which coerces it to the literal string "[object Object]" — so a real,
// specific rejection (e.g. "Unknown document type.") rendered as a useless
// toast, making a hard failure look like nothing happened.
function extractErrorMessage(data) {
  if (data?.message) return data.message;
  if (typeof data?.error === "string") return data.error;
  if (data?.error?.message) return data.error.message;
  return "Something went wrong. Please try again.";
}

function splitTopLevelJsonDocuments(text) {
  const documents = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (start === -1) {
      if (/\s/.test(character)) continue;
      if (character !== "{" && character !== "[") return [];
      start = index;
      depth = 1;
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === "{" || character === "[") {
      depth += 1;
    } else if (character === "}" || character === "]") {
      depth -= 1;
      if (depth === 0) {
        documents.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return start === -1 ? documents : [];
}

// A misconfigured server/error-handler chain can append a second JSON object
// to the first one (for example `{"message":"..."}{"message":"Server Error"}`).
// Browsers reject that with a raw JSON SyntaxError, hiding the useful HTTP
// status and preventing the normal API error UI from running.
export function parseApiJsonResponse(text) {
  if (!text.trim()) return { data: null, malformed: false };

  try {
    return { data: JSON.parse(text), malformed: false };
  } catch (parseError) {
    const documents = splitTopLevelJsonDocuments(text);
    if (documents.length > 1) {
      try {
        const parsedDocuments = documents.map(document => JSON.parse(document));
        return {
          data: parsedDocuments.at(-1),
          malformed: true,
          parseError,
        };
      } catch {
        // Fall through to the generic malformed-response result below.
      }
    }

    return { data: null, malformed: true, parseError };
  }
}

export async function apiRequest(path, options = {}) {
  const isFormData = options.body instanceof FormData;

  // Use CapacitorHttp for native builds to bypass CORS issues.
  const platform = Capacitor.getPlatform();
  const useNativeHttp = platform === 'android' || platform === 'ios';

  if (useNativeHttp) {
    const url = `${baseUrl}/api${path}`;
    if (import.meta.env.DEV) {
      console.log(`[API] Native Request (${platform}): ${options.method || "GET"} ${url}`);
    }

    try {
      const response = await CapacitorHttp.request({
        url,
        method: options.method || "GET",
        headers: {
          ...(isFormData ? {} : { "Content-Type": "application/json" }),
          Accept: "application/json",
          ...options.headers,
        },
        data: options.body, // CapacitorHttp uses 'data' for body
      });

      const data = response.data;
      if (response.status < 200 || response.status >= 300 || data?.success === false || data?.status === false) {
        const message = extractErrorMessage(data);
        const error = new Error(message);
        error.status = response.status;
        error.data = data;
        if (response.status === 401 && options.headers?.Authorization) {
          window.dispatchEvent(new CustomEvent("auth:unauthorized"));
        }
        throw error;
      }
      return data;
    } catch (err) {
      if (err instanceof Error && !err.status) {
        // Network error
        console.error("[API] Native Request Failed:", err);
      }
      throw err;
    }
  }

  const headers = isFormData
    ? { Accept: "application/json", ...options.headers }
    : {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      };

  const url = `${baseUrl}/api${path}`;
  // Debug log to help identify connectivity issues in the mobile app.
  if (import.meta.env.DEV) {
    console.log(`[API] Request: ${options.method || "GET"} ${url}`);
  }

  const timeoutMs = options.timeout ?? 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      cache: "no-store",
      signal: options.signal || controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s. Please check if backend API server on port 8000 is running.`, { cause: err });
    }
    if (err instanceof TypeError && (err.message?.includes("Failed to fetch") || err.message?.includes("fetch"))) {
      throw new Error("Unable to connect to backend server at http://127.0.0.1:8000/api. Please ensure backend server is running.", { cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  const contentType = response.headers.get("content-type") || "";
  const responseText = await response.text();
  const parsed = contentType.includes("application/json")
    ? parseApiJsonResponse(responseText)
    : { data: null, malformed: false };
  const { data } = parsed;

  if (parsed.malformed) {
    console.error("[API] Server returned malformed JSON", {
      status: response.status,
      url,
    });

    const message = !response.ok && data
      ? extractErrorMessage(data)
      : "The server returned an invalid response. Please try again.";
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    error.cause = parsed.parseError;

    if (response.status === 401 && headers.Authorization) {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    }

    throw error;
  }

  if (!response.ok || data?.success === false || data?.status === false) {
    const message = extractErrorMessage(data);
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
  const query = {};

  // The backend requires a company_code for most lookups. When 'Both Companies'
  // is selected, we send 'all' which is explicitly handled by the server
  // to skip single-company filtering.
  if (scope.companyId) {
    query.company_code = scope.companyId === "all-companies" ? "all" : scope.companyId;
  }

  if (scope.unit) {
    query.unit = scope.unit;
  }

  return query;
}

function mergeCompanyFilters(filters = {}, companyId) {
  const base = buildCompanyQuery(companyId);
  const merged = {
    ...base,
    ...filters,
  };
  if (filters.company_code === "") {
    merged.company_code = "all";
  }
  return merged;
}

export function resolveWriteCompanyId(companyId, fallbackCompanyId) {
  const resolved = resolveCompanyIds(
    resolveCompanyScope(companyId).companyId,
    fallbackCompanyId,
  );
  // Never return 'all-companies' for a write operation; pick the first valid one instead.
  return resolved.filter(id => id !== "all-companies")[0] || resolved[0];
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

  getForm16Employees(
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
    return apiRequest(`/admin/form16/employees?${params}`, {
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

  deleteEmployees(ids, accessToken, tokenType = "Bearer") {
    return apiRequest("/employee/delete-multiple", {
      method: "POST",
      headers: {
        ...(accessToken ? { Authorization: `${tokenType} ${accessToken}` } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids }),
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

  getAttendanceGrid(accessToken, tokenType = "Bearer", { companyId, unit, month, year, only_uploaded } = {}) {
    const params = new URLSearchParams({
      company_code: resolveWriteCompanyId(companyId),
      month,
      year,
    });
    if (unit) params.set("unit", unit);
    if (only_uploaded) params.set("only_uploaded", "1");
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

function authHeaders(accessToken, tokenType) {
  return accessToken ? { Authorization: `${tokenType} ${accessToken}` } : {};
}

/*
 * What survives of the RBAC API after the Access Control screens were removed.
 *
 * These three are not administration endpoints — they are read by pages that
 * have nothing to do with managing permissions:
 *   getMyPermissions -> AuthContext, on every login and session restore
 *   getSettings      -> admin Dashboard (the "main_dashboard" group)
 *   getUserRoles     -> admin Settings (/admin/admins), to list admin users
 */
export const rbacApi = {
  getMyPermissions(accessToken, tokenType = "Bearer") {
    return apiRequest("/my-permissions", { headers: authHeaders(accessToken, tokenType) });
  },

  getSettings(accessToken, tokenType = "Bearer", group = "rbac") {
    return apiRequest(`/rbac/settings?group=${group}`, { headers: authHeaders(accessToken, tokenType) });
  },

  updateSettings(settings, accessToken, tokenType = "Bearer", group = "rbac") {
    return apiRequest(`/rbac/settings?group=${group}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders(accessToken, tokenType) },
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
};

/*
 * Both calls here decide what the signed-in user may do; neither administers
 * permissions. me() builds the permission snapshot AuthContext stores at login,
 * and check() asks the server about one specific record where scope, row and
 * field rules cannot be resolved from that snapshot alone.
 */
export const authorizationApi = {
  me(accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/authorization/me", { headers: authHeaders(accessToken, tokenType) });
  },
  check(permissionCode, resource, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/authorization/check", {
      method: "POST", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify({ permissionCode, resource }),
    });
  },
};

/*
 * Administers permissions, rather than deciding them.
 *
 * Kept apart from authorizationApi on purpose: that one answers "may the
 * signed-in user do this?" and is called on nearly every screen, while these
 * are reachable only from Access Control.
 */
export const authorizationAdminApi = {
  lookupUsers(query, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/user-lookup?q=${encodeURIComponent(query)}`, {
      headers: authHeaders(accessToken, tokenType),
    });
  },
};

export const accessLifecycleApi = {
  listDelegations(accessToken, tokenType = "Bearer", params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/v1/delegations${query ? `?${query}` : ""}`, {
      headers: authHeaders(accessToken, tokenType),
    });
  },

  createDelegation(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/delegations", {
      method: "POST", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  revokeDelegation(id, reason, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/delegations/${id}/revoke`, {
      method: "POST", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify({ reason }),
    });
  },

  listRequests(accessToken, tokenType = "Bearer", params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/v1/access-requests${query ? `?${query}` : ""}`, {
      headers: authHeaders(accessToken, tokenType),
    });
  },

  createRequest(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/access-requests", {
      method: "POST", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  decideRequest(id, action, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/access-requests/${id}/${action}`, {
      method: "POST", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  listEmergencyGrants(accessToken, tokenType = "Bearer", params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/v1/emergency-access${query ? `?${query}` : ""}`, {
      headers: authHeaders(accessToken, tokenType),
    });
  },

  createEmergencyGrant(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/emergency-access", {
      method: "POST", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  revokeEmergencyGrant(id, reason, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/emergency-access/${id}/revoke`, {
      method: "POST", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify({ reason }),
    });
  },
};

export const policyApi = {
  list(accessToken, tokenType = "Bearer", params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/v1/policies${query ? `?${query}` : ""}`, {
      headers: authHeaders(accessToken, tokenType),
    });
  },

  get(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/policies/${id}`, { headers: authHeaders(accessToken, tokenType) });
  },

  create(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/policies", {
      method: "POST", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  update(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/policies/${id}`, {
      method: "PATCH", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  publish(id, businessReason, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/policies/${id}/publish`, {
      method: "POST", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify({ businessReason }),
    });
  },

  rollback(id, version, businessReason, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/policies/${id}/rollback`, {
      method: "POST", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify({ version, businessReason }),
    });
  },
};

/*
 * Access Control > Roles: role records and their lifecycle.
 *
 * Manages the role records themselves; what a role grants is edited from the
 * Permission Matrix. The protected SYSTEM_SUPER_ADMIN role is never
 * returned here — the backend conceals it — so it can neither be listed nor
 * changed from this screen.
 */
export const roleApi = {
  summary(accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/roles/summary", { headers: authHeaders(accessToken, tokenType) });
  },

  list(accessToken, tokenType = "Bearer", params = {}) {
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""))
    ).toString();
    return apiRequest(`/v1/roles/manage${query ? `?${query}` : ""}`, {
      headers: authHeaders(accessToken, tokenType),
    });
  },

  get(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/roles/${id}`, { headers: authHeaders(accessToken, tokenType) });
  },

  create(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/roles", {
      method: "POST", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  update(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/roles/${id}`, {
      method: "PUT", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  // `force` also strips the role from whoever holds it. The server accepts it
  // only from a super administrator and ignores it otherwise.
  remove(id, accessToken, tokenType = "Bearer", force = false) {
    return apiRequest(`/v1/roles/${id}${force ? "?force=1" : ""}`, {
      method: "DELETE", headers: authHeaders(accessToken, tokenType),
    });
  },

  transition(id, action, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/roles/${id}/${action}`, {
      method: "POST", headers: authHeaders(accessToken, tokenType),
    });
  },

  clone(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/roles/${id}/clone`, {
      method: "POST", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },
};

function userQuery(filters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.append(key, value);
  });

  const query = params.toString();
  return query ? `?${query}` : "";
}

/*
 * Kept apart from authorizationApi for the reason that one is kept apart from
 * the decision endpoints: these administer accounts rather than answering "may
 * the signed-in user do this?", and only Access Control > Users calls them.
 */
export const adminUserApi = {
  list(filters, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/users${userQuery(filters)}`, {
      headers: authHeaders(accessToken, tokenType),
    });
  },

  get(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/users/${id}`, { headers: authHeaders(accessToken, tokenType) });
  },

  filterOptions(accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/users/filter-options", {
      headers: authHeaders(accessToken, tokenType),
    });
  },

  create(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/users", {
      method: "POST", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  update(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/users/${id}`, {
      method: "PUT", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  remove(id, reason, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/users/${id}`, {
      method: "DELETE", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify({ reason }),
    });
  },

  action(id, action, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/users/${id}/${action}`, {
      method: "POST", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify(payload ?? {}),
    });
  },

  auditLogs(id, accessToken, tokenType = "Bearer", limit = 50) {
    return apiRequest(`/v1/admin/users/${id}/audit-logs?limit=${limit}`, {
      headers: authHeaders(accessToken, tokenType),
    });
  },

  bulk(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/users/bulk", {
      method: "POST", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  // Streamed as a file rather than JSON, so it bypasses apiRequest's parser.
  async export(filters, format, accessToken, tokenType = "Bearer") {
    const response = await fetch(
      `${baseUrl}/api/v1/admin/users/export${userQuery({ ...filters, format })}`,
      { headers: { Accept: "*/*", ...authHeaders(accessToken, tokenType) }, cache: "no-store" },
    );

    if (!response.ok) {
      let data = null;
      try {
        data = await response.json();
      } catch {
        // A non-JSON error body is still a failure; the status carries enough.
      }

      const error = new Error(extractErrorMessage(data));
      error.status = response.status;

      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent("auth:unauthorized"));
      }

      throw error;
    }

    return response.blob();
  },
};

/**
 * Access Control → Company & Unit.
 *
 * The canonical master data. Every company and unit selector in the product —
 * New User, Edit User, and in time the Trial and Appointment forms — resolves
 * through here rather than through a constant, so creating a company once makes
 * it appear everywhere without a deployment.
 */
export const companyUnitApi = {
  companies(filters, accessToken, tokenType = "Bearer") {
    const params = new URLSearchParams();
    if (filters?.search) params.set("search", filters.search);
    if (filters?.status) params.set("status", filters.status);
    const query = params.toString();

    return apiRequest(`/v1/admin/companies${query ? `?${query}` : ""}`, {
      headers: authHeaders(accessToken, tokenType),
    });
  },

  createCompany(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/companies", {
      method: "POST", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateCompany(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/companies/${id}`, {
      method: "PUT", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  setCompanyStatus(id, isActive, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/companies/${id}/status`, {
      method: "PATCH", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify({ isActive }),
    });
  },

  deleteCompany(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/companies/${id}`, {
      method: "DELETE", headers: authHeaders(accessToken, tokenType),
    });
  },

  units(filters, accessToken, tokenType = "Bearer") {
    const params = new URLSearchParams();
    (filters?.companyIds ?? []).forEach((id) => params.append("company_ids[]", id));
    if (filters?.search) params.set("search", filters.search);
    if (filters?.status) params.set("status", filters.status);
    const query = params.toString();

    return apiRequest(`/v1/admin/units${query ? `?${query}` : ""}`, {
      headers: authHeaders(accessToken, tokenType),
    });
  },

  createUnit(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/units", {
      method: "POST", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateUnit(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/units/${id}`, {
      method: "PUT", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  setUnitStatus(id, isActive, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/units/${id}/status`, {
      method: "PATCH", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify({ isActive }),
    });
  },

  deleteUnit(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/v1/admin/units/${id}`, {
      method: "DELETE", headers: authHeaders(accessToken, tokenType),
    });
  },

  // Unit names that predate the units table, with the number of people carrying
  // each. Ownership is chosen by an administrator, never inferred from counts.
  legacyUnits(accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/units/legacy", { headers: authHeaders(accessToken, tokenType) });
  },

  adoptLegacyUnit(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/admin/units/legacy/adopt", {
      method: "POST", headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },
};

/**
 * Companies and units the signed-in actor may file a record into.
 *
 * The employee-lifecycle forms read this rather than the build-time
 * companyConfig constant, so a company created in Company & Unit Management
 * appears in the Trial and Appointment forms without a deployment — and a form
 * cannot offer a tenant the server would refuse.
 *
 * Separate from companyUnitApi on purpose: this is a scoped lookup any
 * authenticated actor may make, not the management surface.
 */
export const provisioningLookupApi = {
  companyOptions(accessToken, tokenType = "Bearer") {
    return apiRequest("/v1/provisioning/company-options", {
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
   *
   * No caller remains in the app. Appointment details read aadhaar_full from the
   * details response, and Print/PDF now go through confidentialExportApi, which
   * issues an auditable single-purpose authorization instead of a bare reveal.
   * Kept because the route is still live and tested server-side, so removing the
   * only client wrapper would just make it harder to reach.
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

/**
 * Confidential (full-Aadhaar) Print and PDF export.
 *
 * No caller remains in the app. Print and PDF now render the complete number
 * directly, because display is gated on record access rather than on a separate
 * export permission, so the two-stage authorise-then-export flow no longer has a
 * masked alternative to choose between.
 *
 * Kept because the endpoints are live, org-scoped and covered by
 * AadhaarConfidentialExportTest: they remain the only way to obtain a
 * server-generated, watermarked PDF whose bytes cannot be altered through the
 * DOM, which is worth having available if export ever needs its own gate again.
 *
 * `surface` is "appointments" or "employees" — the same flow, different
 * permission keys and different audit action names.
 */
export const confidentialExportApi = {
  /**
   * Ask for a fresh authorization. Returns the export token; throws otherwise.
   *
   * Nothing about the record is sent — not the Aadhaar, not the rendered
   * document, not a claim about what the client thinks it is allowed to do. The
   * server reads all of that from the stored row.
   */
  authorize(id, exportType, accessToken, tokenType = "Bearer", surface = "appointments") {
    return apiRequest(`/v1/${surface}/${id}/aadhaar/export-authorization`, {
      method: "POST",
      headers: {
        ...authHeaders(accessToken, tokenType),
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({ exportType }),
    });
  },

  /** The trusted print view model, bound to a PRINT authorization. */
  printPayload(id, exportToken, accessToken, tokenType = "Bearer", surface = "appointments") {
    return apiRequest(`/v1/${surface}/${id}/confidential-print-payload`, {
      method: "POST",
      headers: {
        ...authHeaders(accessToken, tokenType),
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({ exportToken }),
    });
  },

  /**
   * The server-generated PDF, as a Blob.
   *
   * Deliberately not routed through apiRequest: that helper parses JSON and
   * would discard the body. A confidential PDF is generated and watermarked on
   * the server precisely so that its bytes never depend on the DOM, so it has to
   * arrive here as opaque bytes.
   */
  async downloadPdf(id, exportToken, accessToken, tokenType = "Bearer", surface = "appointments") {
    const response = await fetch(`${baseUrl}/api/v1/${surface}/${id}/confidential-pdf`, {
      method: "POST",
      headers: {
        ...authHeaders(accessToken, tokenType),
        "Content-Type": "application/json",
        Accept: "application/pdf",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({ exportToken }),
      cache: "no-store",
    });

    if (!response.ok) {
      // The error body is JSON even though we asked for a PDF; read the code so
      // the caller can distinguish "not permitted" from "switched off".
      let data = null;
      try {
        data = await response.json();
      } catch {
        // A non-JSON error body is still a failure; the status carries enough.
      }

      const error = new Error(
        data?.error?.message || data?.message || "Confidential export was refused.",
      );
      error.status = response.status;
      error.code = data?.error?.code;
      error.data = data;

      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent("auth:unauthorized"));
      }

      throw error;
    }

    const blob = await response.blob();

    // A zero-byte or wrongly-typed body means something upstream failed without
    // saying so. Refuse it rather than saving a broken "confidential" file.
    if (!blob || blob.size === 0) {
      const error = new Error("The confidential document came back empty.");
      error.status = response.status;
      throw error;
    }

    return blob;
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

  /**
   * Step 1 of password recovery: confirm the employee code against the mobile
   * number on file.
   *
   * This used to send an Aadhaar number, retried across three formattings
   * (spaced, raw, dashed) because the column stored it inconsistently. That
   * loop is gone: the server now reduces both sides to the last ten digits
   * before comparing, so one request settles it. Retrying a failed credential
   * check three times also tripled the cost of every wrong attempt against the
   * endpoint's rate limit.
   */
  verifyEmpCode(empCode, companyId, unit, details = {}) {
    const mobile = String(details.mobile_num || details.mob_num || "").replace(/\D/g, "");

    const payload = this.buildScopedResetPayload(companyId, unit, {
      emp_code: empCode,
      mobile_number: mobile,
      dob: details.dob,
      address: details.address,
      type: 0,
    });

    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null) formData.append(key, value);
    });
    if (details.photo) formData.append("photo", details.photo);

    return apiRequest("/new-emp_code", { method: "POST", body: formData });
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

  /**
   * Step 3 of the email reset.
   *
   * `otp` is the code the user already entered at step 2, forwarded rather
   * than re-prompted. The Laravel endpoint ignores it — it checks only that
   * some OTP is outstanding, which is why knowing an email address is
   * currently enough to reset an account. The Node implementation verifies
   * it. Sending it is a no-op against the old backend and a requirement
   * against the new one.
   */
  setNewPassword(password, email, otp) {
    return apiRequest("/new-password", {
      method: "POST",
      body: JSON.stringify({
        password,
        email,
        otp,
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
    const batchId = typeof companyId === "object" ? companyId.batch_id : null;
    return apiRequest("/employee/import", {
      method: "POST",
      headers: accessToken
        ? { Authorization: `${tokenType} ${accessToken}` }
        : {},
      body: JSON.stringify({
        rows,
        company_code: resolveWriteCompanyId(scope.companyId),
        unit: unit || scope.unit || "",
        batch_id: batchId || null,
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

  getAppointmentForms(accessToken, tokenType = "Bearer", companyId, options = {}) {
    const params = new URLSearchParams(buildCompanyQuery(companyId));
    Object.entries({
      page: options.page,
      per_page: options.perPage,
      search: options.search,
      status: options.status,
    }).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "" && value !== "All") {
        params.append(key, value);
      }
    });
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

function hrAuthHeaders(accessToken, tokenType) {
  return accessToken ? { Authorization: `${tokenType} ${accessToken}` } : {};
}

function hrQuery(params = {}) {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    usp.set(key, value);
  });
  const query = usp.toString();
  return query ? `?${query}` : "";
}

export const modulesApi = {
  // Which optional modules actually have their schema. Used to keep menu
  // entries for absent modules out of the navigation entirely.
  get(accessToken, tokenType = "Bearer") {
    return apiRequest(`/modules`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },
};

export const hrApi = {
  getDashboard(accessToken, tokenType = "Bearer", filters = {}) {
    return apiRequest(`/hr/dashboard${hrQuery(filters)}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },

  // Requisitions
  getRequisitions(accessToken, tokenType = "Bearer", filters = {}) {
    return apiRequest(`/hr/requisitions/get${hrQuery(filters)}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },
  getRequisition(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/requisitions/show/${id}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },
  storeRequisition(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/hr/requisitions/store", { method: "POST", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },
  updateRequisition(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/requisitions/update/${id}`, { method: "PUT", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },
  deleteRequisition(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/requisitions/delete/${id}`, { method: "DELETE", headers: hrAuthHeaders(accessToken, tokenType) });
  },
  approveRequisition(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/requisitions/approve/${id}`, { method: "POST", headers: hrAuthHeaders(accessToken, tokenType) });
  },
  publishRequisition(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/requisitions/publish/${id}`, { method: "POST", headers: hrAuthHeaders(accessToken, tokenType) });
  },
  publishToIndeed(id, payload = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/requisitions/publish-indeed/${id}`, { method: "POST", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },

  // Quizzes
  getQuizzes(accessToken, tokenType = "Bearer", filters = {}) {
    return apiRequest(`/hr/quizzes/get${hrQuery(filters)}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },
  getQuiz(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/quizzes/show/${id}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },
  storeQuiz(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/hr/quizzes/store", { method: "POST", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },
  updateQuiz(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/quizzes/update/${id}`, { method: "PUT", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },
  deleteQuiz(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/quizzes/delete/${id}`, { method: "DELETE", headers: hrAuthHeaders(accessToken, tokenType) });
  },

  // Quiz attempts (HR side — assigning a quiz to a candidate and reading
  // back the score and proctoring trail). The candidate's own runner talks
  // to publicQuizApi below, which is deliberately unauthenticated.
  getQuizAttempts(accessToken, tokenType = "Bearer", filters = {}) {
    return apiRequest(`/hr/quiz-attempts/get${hrQuery(filters)}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },
  getQuizAttempt(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/quiz-attempts/show/${id}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },
  getAssignableCandidates(accessToken, tokenType = "Bearer", filters = {}) {
    return apiRequest(`/hr/quiz-attempts/candidates${hrQuery(filters)}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },
  assignQuiz(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/hr/quiz-attempts/store", { method: "POST", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },
  revokeQuizAttempt(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/quiz-attempts/delete/${id}`, { method: "DELETE", headers: hrAuthHeaders(accessToken, tokenType) });
  },

  // Candidates
  getCandidates(accessToken, tokenType = "Bearer", filters = {}) {
    return apiRequest(`/hr/candidates/get${hrQuery(filters)}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },
  getPipeline(accessToken, tokenType = "Bearer", filters = {}) {
    return apiRequest(`/hr/candidates/pipeline${hrQuery(filters)}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },
  getCandidate(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/candidates/show/${id}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },
  storeCandidate(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/hr/candidates/store", { method: "POST", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },
  updateCandidate(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/candidates/update/${id}`, { method: "PUT", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },
  deleteCandidate(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/candidates/delete/${id}`, { method: "DELETE", headers: hrAuthHeaders(accessToken, tokenType) });
  },
  moveCandidateStage(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/candidates/move-stage/${id}`, { method: "POST", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },

  // Interviews
  getInterviews(accessToken, tokenType = "Bearer", filters = {}) {
    return apiRequest(`/hr/interviews/get${hrQuery(filters)}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },
  getInterview(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/interviews/show/${id}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },
  storeInterview(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/hr/interviews/store", { method: "POST", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },
  updateInterview(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/interviews/update/${id}`, { method: "PUT", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },
  deleteInterview(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/interviews/delete/${id}`, { method: "DELETE", headers: hrAuthHeaders(accessToken, tokenType) });
  },
  rescheduleInterview(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/interviews/reschedule/${id}`, { method: "POST", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },
  submitInterviewFeedback(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/interviews/feedback/${id}`, { method: "POST", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },

  // Offers
  getOffers(accessToken, tokenType = "Bearer", filters = {}) {
    return apiRequest(`/hr/offers/get${hrQuery(filters)}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },
  getOffer(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/offers/show/${id}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },
  storeOffer(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/hr/offers/store", { method: "POST", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },
  updateOffer(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/offers/update/${id}`, { method: "PUT", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },
  deleteOffer(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/offers/delete/${id}`, { method: "DELETE", headers: hrAuthHeaders(accessToken, tokenType) });
  },
  approveOffer(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/offers/approve/${id}`, { method: "POST", headers: hrAuthHeaders(accessToken, tokenType) });
  },
  releaseOffer(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/offers/release/${id}`, { method: "POST", headers: hrAuthHeaders(accessToken, tokenType) });
  },
  respondOffer(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/offers/respond/${id}`, { method: "POST", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },

  // Assets
  getAssets(accessToken, tokenType = "Bearer", filters = {}) {
    return apiRequest(`/hr/assets/get${hrQuery(filters)}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },
  getAssetDashboard(accessToken, tokenType = "Bearer", filters = {}) {
    return apiRequest(`/hr/assets/dashboard${hrQuery(filters)}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },
  getAsset(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/assets/show/${id}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },
  storeAsset(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/hr/assets/store", { method: "POST", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },
  updateAsset(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/assets/update/${id}`, { method: "PUT", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },
  deleteAsset(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/assets/delete/${id}`, { method: "DELETE", headers: hrAuthHeaders(accessToken, tokenType) });
  },
  allocateAsset(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/assets/allocate/${id}`, { method: "POST", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },
  returnAsset(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/assets/return/${id}`, { method: "POST", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },
  transferAsset(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/assets/transfer/${id}`, { method: "POST", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },

  // Performance
  getPerformanceDashboard(accessToken, tokenType = "Bearer", filters = {}) {
    return apiRequest(`/hr/performance/dashboard${hrQuery(filters)}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },
  getPerformanceCycles(accessToken, tokenType = "Bearer") {
    return apiRequest("/hr/performance/cycles/get", { headers: hrAuthHeaders(accessToken, tokenType) });
  },
  storePerformanceCycle(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/hr/performance/cycles/store", { method: "POST", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },
  updatePerformanceCycle(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/performance/cycles/update/${id}`, { method: "PUT", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },
  deletePerformanceCycle(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/performance/cycles/delete/${id}`, { method: "DELETE", headers: hrAuthHeaders(accessToken, tokenType) });
  },
  getPerformanceGoals(accessToken, tokenType = "Bearer", filters = {}) {
    return apiRequest(`/hr/performance/goals/get${hrQuery(filters)}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },
  storePerformanceGoal(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/hr/performance/goals/store", { method: "POST", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },
  updatePerformanceGoal(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/performance/goals/update/${id}`, { method: "PUT", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },
  deletePerformanceGoal(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/performance/goals/delete/${id}`, { method: "DELETE", headers: hrAuthHeaders(accessToken, tokenType) });
  },
  getPerformanceReviews(accessToken, tokenType = "Bearer", filters = {}) {
    return apiRequest(`/hr/performance/reviews/get${hrQuery(filters)}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },
  storePerformanceReview(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/hr/performance/reviews/store", { method: "POST", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },
  updatePerformanceReview(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/performance/reviews/update/${id}`, { method: "PUT", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },

  // Reports
  generateReport(type, filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/reports/generate${hrQuery({ type, ...filters })}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },

  // Exit management
  getResignations(accessToken, tokenType = "Bearer", filters = {}) {
    return apiRequest(`/hr/exit/get${hrQuery(filters)}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },
  storeResignation(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/hr/exit/store", { method: "POST", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(payload) });
  },
  updateResignationStatus(id, payload, accessToken, tokenType = "Bearer") {
    const bodyObj = typeof payload === "string" ? { status: payload } : payload;
    return apiRequest(`/hr/exit/status/${id}`, { method: "PUT", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify(bodyObj) });
  },

  // Candidate documents — a real upload endpoint, unlike the Onboarding
  // module's fabricated/stubbed document records.
  getCandidateDocuments(candidateId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/candidates/documents/get/${candidateId}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },
  uploadCandidateDocument(candidateId, formData, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/candidates/documents/store/${candidateId}`, { method: "POST", headers: hrAuthHeaders(accessToken, tokenType), body: formData });
  },
  deleteCandidateDocument(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/candidates/documents/delete/${id}`, { method: "DELETE", headers: hrAuthHeaders(accessToken, tokenType) });
  },
  reviewCandidateDocument(id, decision, remarks, accessToken, tokenType = "Bearer") {
    return apiRequest(`/hr/candidates/documents/review/${id}/${decision}`, { method: "POST", headers: hrAuthHeaders(accessToken, tokenType), body: JSON.stringify({ remarks }) });
  },
};

/*
 * The candidate-facing quiz runner. Deliberately has no auth header: a
 * candidate is not a user and has no login, so the per-attempt token in the
 * URL is the only credential. Kept separate from hrApi so it's obvious at a
 * glance which calls are unauthenticated.
 */
export const publicQuizApi = {
  get(token) {
    return apiRequest(`/quiz/${token}`);
  },
  start(token) {
    return apiRequest(`/quiz/${token}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  },
  saveProgress(token, answers) {
    return apiRequest(`/quiz/${token}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
  },
  logEvent(token, type, detail, countsAsViolation = true) {
    return apiRequest(`/quiz/${token}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, detail, counts_as_violation: countsAsViolation }),
    });
  },
  submit(token, answers) {
    return apiRequest(`/quiz/${token}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
  },
};

/**
 * Support tickets.
 *
 * One client for employees and staff alike: the endpoints are shared and the
 * server decides what each caller may see (Ticket::scopeVisibleTo). Nothing here
 * branches on role — a client-side rule would only ever drift from it.
 */
export const ticketApi = {
  getCategories(accessToken, tokenType = "Bearer") {
    return apiRequest(`/tickets/categories`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },

  getDashboard(accessToken, tokenType = "Bearer", filters = {}) {
    return apiRequest(`/tickets/dashboard${hrQuery(filters)}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },

  // `mine` means "raised by me" for an employee and "assigned to me" for staff.
  getTickets(accessToken, tokenType = "Bearer", filters = {}) {
    return apiRequest(`/tickets/get${hrQuery(filters)}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },

  getTicket(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/tickets/show/${id}`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },

  createTicket(payload, accessToken, tokenType = "Bearer") {
    return apiRequest("/tickets/store", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...hrAuthHeaders(accessToken, tokenType) },
      body: JSON.stringify(payload),
    });
  },

  reply(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/tickets/${id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...hrAuthHeaders(accessToken, tokenType) },
      body: JSON.stringify(payload),
    });
  },

  reopen(id, reason, accessToken, tokenType = "Bearer") {
    return apiRequest(`/tickets/${id}/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...hrAuthHeaders(accessToken, tokenType) },
      body: JSON.stringify({ reason }),
    });
  },

  // Staff only — gated with role:admin on the server.
  getAssignees(accessToken, tokenType = "Bearer") {
    return apiRequest(`/tickets/assignees`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },

  assign(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/tickets/${id}/assign`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...hrAuthHeaders(accessToken, tokenType) },
      body: JSON.stringify(payload),
    });
  },

  updateStatus(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/tickets/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...hrAuthHeaders(accessToken, tokenType) },
      body: JSON.stringify(payload),
    });
  },

  deleteTicket(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/tickets/${id}`, {
      method: "DELETE",
      headers: hrAuthHeaders(accessToken, tokenType),
    });
  },

  /*
   * Staff actions.
   *
   * Only endpoints that exist in routes/api.php appear here. This object
   * previously also carried overrideAction, transferTicket, stopEscalation,
   * resetSlaTimer and getAuditLogs, pointing at /override, /transfer,
   * /stop-escalation, /reset-sla and /audit-logs — none of which are routed, so
   * every one of them 404'd. They are gone rather than left as buttons that
   * cannot work.
   */
  escalate(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/tickets/${id}/escalate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...hrAuthHeaders(accessToken, tokenType) },
      body: JSON.stringify(payload ?? {}),
    });
  },

  // One action over a selection; the response reports per-ticket outcomes.
  bulk(payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/tickets/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...hrAuthHeaders(accessToken, tokenType) },
      body: JSON.stringify(payload),
    });
  },

  getReports(type, filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`/tickets/reports${hrQuery({ type, ...filters })}`, {
      headers: hrAuthHeaders(accessToken, tokenType),
    });
  },

  getSlaRules(accessToken, tokenType = "Bearer") {
    return apiRequest(`/tickets/sla-rules`, {
      headers: hrAuthHeaders(accessToken, tokenType),
    });
  },

  updateSlaRules(payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/tickets/sla-rules`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...hrAuthHeaders(accessToken, tokenType) },
      body: JSON.stringify(payload),
    });
  },

  // Drops a department's override; it falls back to the company-wide rules.
  deleteSlaOverride(department, accessToken, tokenType = "Bearer") {
    return apiRequest(`/tickets/sla-rules/${encodeURIComponent(department)}`, {
      method: "DELETE",
      headers: hrAuthHeaders(accessToken, tokenType),
    });
  },

  getSettings(accessToken, tokenType = "Bearer") {
    return apiRequest(`/tickets/settings`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },

  updateSettings(payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/tickets/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...hrAuthHeaders(accessToken, tokenType) },
      body: JSON.stringify(payload),
    });
  },

  // Admin view — includes inactive categories and their usage counts. The
  // employee-facing getCategories() stays active-only.
  getManagedCategories(accessToken, tokenType = "Bearer") {
    return apiRequest(`/tickets/categories/manage`, { headers: hrAuthHeaders(accessToken, tokenType) });
  },

  createCategory(payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/tickets/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...hrAuthHeaders(accessToken, tokenType) },
      body: JSON.stringify(payload),
    });
  },

  updateCategory(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/tickets/categories/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...hrAuthHeaders(accessToken, tokenType) },
      body: JSON.stringify(payload),
    });
  },

  deleteCategory(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/tickets/categories/${id}`, {
      method: "DELETE",
      headers: hrAuthHeaders(accessToken, tokenType),
    });
  },

  /*
   * Attachments.
   *
   * No Content-Type header here on purpose: the browser has to set its own
   * multipart boundary, and naming the type ourselves would produce a body the
   * server cannot parse. apiRequest already skips the JSON header for FormData.
   */
  uploadAttachments(id, files, accessToken, tokenType = "Bearer") {
    const body = new FormData();
    Array.from(files).forEach((file) => body.append("files[]", file));

    return apiRequest(`/tickets/${id}/attachments`, {
      method: "POST",
      headers: hrAuthHeaders(accessToken, tokenType),
      body,
    });
  },

  /**
   * Fetch an attachment and hand it to the browser.
   *
   * Not an <a href>: the endpoint requires the bearer token, which a plain link
   * cannot send — it would just 401. Fetching as a blob keeps the file behind
   * the same authorisation as the rest of the ticket.
   */
  async downloadAttachment(id, attachmentId, fileName, accessToken, tokenType = "Bearer") {
    const response = await fetch(`${baseUrl}/api/tickets/${id}/attachments/${attachmentId}`, {
      headers: hrAuthHeaders(accessToken, tokenType),
    });

    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? "That file is no longer available."
          : "Could not download the attachment.",
      );
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName || "attachment";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  async getAttachmentBlobUrl(id, attachmentId, accessToken, tokenType = "Bearer") {
    const response = await fetch(`${baseUrl}/api/tickets/${id}/attachments/${attachmentId}`, {
      headers: hrAuthHeaders(accessToken, tokenType),
    });

    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? "That file is no longer available."
          : "Could not view the attachment.",
      );
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const contentType = response.headers.get("content-type") || blob.type || "";
    return { url, contentType, blob };
  },

  async viewAttachment(id, attachmentId, accessToken, tokenType = "Bearer") {
    const { url } = await this.getAttachmentBlobUrl(id, attachmentId, accessToken, tokenType);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },

  deleteAttachment(id, attachmentId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/tickets/${id}/attachments/${attachmentId}`, {
      method: "DELETE",
      headers: hrAuthHeaders(accessToken, tokenType),
    });
  },
};

/**
 * Employee reporting lines — the chain ticket routing and escalation walk.
 *
 * The four assignment rules (no self-reporting, no inactive manager, same
 * company, no cycles) live on the server. `getCandidates` returns only choices
 * that pass them, so the picker cannot offer something the save would reject —
 * but the save re-checks regardless, because a stale list is not a permission.
 */
export const hierarchyApi = {
  list(accessToken, tokenType = "Bearer", filters = {}) {
    return apiRequest(`/reporting-hierarchy/get${hrQuery(filters)}`, {
      headers: hrAuthHeaders(accessToken, tokenType),
    });
  },

  getChain(userId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/reporting-hierarchy/${userId}`, {
      headers: hrAuthHeaders(accessToken, tokenType),
    });
  },

  getCandidates(userId, accessToken, tokenType = "Bearer") {
    return apiRequest(`/reporting-hierarchy/${userId}/candidates`, {
      headers: hrAuthHeaders(accessToken, tokenType),
    });
  },

  setManager(userId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`/reporting-hierarchy/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...hrAuthHeaders(accessToken, tokenType) },
      body: JSON.stringify(payload),
    });
  },

  clearManager(userId, reason, accessToken, tokenType = "Bearer") {
    return apiRequest(`/reporting-hierarchy/${userId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...hrAuthHeaders(accessToken, tokenType) },
      body: JSON.stringify({ reason }),
    });
  },
};

/**
 * In-app notifications for the signed-in user.
 *
 * Every endpoint is anchored server-side on the caller's own id — there is no
 * "fetch user X's notifications" call, by design.
 */
export const notificationApi = {
  list(accessToken, tokenType = "Bearer", filters = {}) {
    return apiRequest(`/notifications${hrQuery(filters)}`, {
      headers: hrAuthHeaders(accessToken, tokenType),
    });
  },

  // Cheap enough to poll for the bell badge.
  unreadCount(accessToken, tokenType = "Bearer") {
    return apiRequest(`/notifications/unread-count`, {
      headers: hrAuthHeaders(accessToken, tokenType),
    });
  },

  markRead(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/notifications/${id}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...hrAuthHeaders(accessToken, tokenType) },
      body: "{}",
    });
  },

  markAllRead(accessToken, tokenType = "Bearer") {
    return apiRequest(`/notifications/read-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...hrAuthHeaders(accessToken, tokenType) },
      body: "{}",
    });
  },

  remove(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`/notifications/${id}`, {
      method: "DELETE",
      headers: hrAuthHeaders(accessToken, tokenType),
    });
  },
};
