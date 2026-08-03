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

async function apiRequest(path, options = {}) {
  const isFormData = options.body instanceof FormData;

  // Use CapacitorHttp for native builds to bypass CORS issues.
  const platform = Capacitor.getPlatform();
  const useNativeHttp = platform === 'android' || platform === 'ios';

  if (useNativeHttp) {
    const url = `${baseUrl}/api${path}`;
    console.log(`[API] Native Request (${platform}): ${options.method || "GET"} ${url}`);

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
  console.log(`[API] Request: ${options.method || "GET"} ${url}`);

  const response = await fetch(url, {
    ...options,
    headers,
    cache: "no-store",
  });

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
  return {
    ...filters,
    ...buildCompanyQuery(companyId),
  };
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

  async verifyEmpCode(empCode, companyId, unit, details = {}) {
    const rawAadhaar = String(details.aadhar_num || details.mob_num || "").replace(/\D/g, "");
    const formattedAadhaar = rawAadhaar.length === 12
      ? `${rawAadhaar.slice(0, 4)} ${rawAadhaar.slice(4, 8)} ${rawAadhaar.slice(8, 12)}`
      : rawAadhaar;
    const dashedAadhaar = rawAadhaar.length === 12
      ? `${rawAadhaar.slice(0, 4)}-${rawAadhaar.slice(4, 8)}-${rawAadhaar.slice(8, 12)}`
      : rawAadhaar;

    // Try formatted first (since DB stores Aadhaar with spaces like "1234 1234 1234"), then raw, then dashed
    const aadhaarVariations = Array.from(new Set([
      formattedAadhaar,
      rawAadhaar,
      dashedAadhaar,
    ])).filter(Boolean);

    let lastError = null;

    for (const val of aadhaarVariations) {
      try {
        const payload = this.buildScopedResetPayload(companyId, unit, {
          emp_code: empCode,
          mobile_number: val,
          mobile_no: val,
          mobile: val,
          aadhar_card_no: val,
          aadhar_card_number: val,
          aadhaar_card_no: val,
          aadhaar_card_number: val,
          aadhar_no: val,
          aadhaar_no: val,
          aadhar: val,
          aadhaar: val,
          dob: details.dob,
          address: details.address,
          type: 0,
        });

        const formData = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          if (value !== undefined && value !== null) formData.append(key, value);
        });
        if (details.photo) formData.append("photo", details.photo);

        return await apiRequest("/new-emp_code", {
          method: "POST",
          body: formData,
        });
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error("Could not verify your details. Please check and try again.");
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
};
