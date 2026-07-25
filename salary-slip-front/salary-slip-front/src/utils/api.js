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
          params.set("status", value === "Active" ? "0" : "1");
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
          params.set("status", value === "Active" ? "0" : "1");
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

  getDepartments(accessToken, tokenType = "Bearer") {
    return apiRequest("/department/get", {
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

  deleteSlip(id, accessToken, tokenType = "Bearer", companyId) {
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
};

export const authApi = {
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

  verifyEmail(empCode, email, companyId, unit, verificationToken) {
    return apiRequest("/new-email", {
      method: "POST",
      body: JSON.stringify(
        this.buildScopedResetPayload(companyId, unit, {
          emp_code: empCode,
          email,
          verification_token: verificationToken,
          type: 1,
        }),
      ),
    });
  },

  verifyEmailOtp(empCode, email, otp, companyId, unit, verificationToken) {
    return apiRequest("/new-email-otp", {
      method: "POST",
      body: JSON.stringify(
        this.buildScopedResetPayload(companyId, unit, {
          emp_code: empCode,
          email,
          otp,
          verification_token: verificationToken,
          type: 2,
        }),
      ),
    });
  },

  setNewPassword(empCode, password, email, companyId, unit, verificationToken) {
    return apiRequest("/new-password", {
      method: "POST",
      body: JSON.stringify(
        this.buildScopedResetPayload(companyId, unit, {
          emp_code: empCode,
          password,
          email,
          verification_token: verificationToken,
          type: 3,
        }),
      ),
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
