import { apiRequest } from "./api";
import * as mocks from "./onboardingMocks";

const authHeaders = (accessToken, tokenType = "Bearer") => ({
  Authorization: `${tokenType} ${accessToken}`,
  Accept: "application/json",
  "Content-Type": "application/json",
});

const query = (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") params.append(k, v);
  });
  const s = params.toString();
  return s ? `?${s}` : "";
};

function isUnavailable(err) {
  const status = err?.status ?? err?.response?.status;
  if (status === 404 || status === 503) return true;
  const code = err?.data?.error?.code || err?.code;
  return code === "MODULE_SCHEMA_NOT_READY" || code === "AUTHORIZATION_SCHEMA_NOT_READY";
}

async function withFallback(request, fallback) {
  try {
    const res = await request();
    const payload = res?.data?.data ?? res?.data ?? res;
    return { data: payload, source: "api" };
  } catch (err) {
    if (isUnavailable(err)) return { data: fallback, source: "preview" };
    throw err;
  }
}

export const onboardingApi = {
  getDashboard(accessToken, tokenType, filters = {}) {
    return withFallback(
      () => apiRequest(`/hr/onboarding/dashboard${query(filters)}`, { headers: authHeaders(accessToken, tokenType) }),
      mocks.DASHBOARD,
    );
  },

  getJourneys(accessToken, tokenType, filters = {}) {
    return withFallback(
      () => apiRequest(`/hr/onboarding/journeys${query(filters)}`, { headers: authHeaders(accessToken, tokenType) }),
      mocks.JOURNEYS,
    );
  },

  getJourney(id, accessToken, tokenType) {
    return withFallback(
      () => apiRequest(`/hr/onboarding/journeys/${id}`, { headers: authHeaders(accessToken, tokenType) }),
      mocks.JOURNEYS.find((j) => j.id === Number(id)) || null,
    );
  },

  getDocuments(accessToken, tokenType, filters = {}) {
    return withFallback(
      () => apiRequest(`/hr/onboarding/documents${query(filters)}`, { headers: authHeaders(accessToken, tokenType) }),
      mocks.DOCUMENTS,
    );
  },

  reviewDocument(id, decision, remarks, accessToken, tokenType) {
    return apiRequest(`/hr/onboarding/documents/${id}/${decision}`, {
      method: "POST",
      headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify({ remarks }),
    });
  },

  getTraining(accessToken, tokenType, filters = {}) {
    return withFallback(
      () => apiRequest(`/hr/onboarding/training${query(filters)}`, { headers: authHeaders(accessToken, tokenType) }),
      mocks.TRAINING,
    );
  },

  getAssets(accessToken, tokenType, filters = {}) {
    return withFallback(
      () => apiRequest(`/hr/onboarding/assets${query(filters)}`, { headers: authHeaders(accessToken, tokenType) }),
      mocks.ASSETS,
    );
  },

  getChecklists(accessToken, tokenType, filters = {}) {
    return withFallback(
      () => apiRequest(`/hr/onboarding/checklists${query(filters)}`, { headers: authHeaders(accessToken, tokenType) }),
      mocks.CHECKLIST_COLUMNS,
    );
  },

  getPolicies(accessToken, tokenType, filters = {}) {
    return withFallback(
      () => apiRequest(`/hr/onboarding/policies${query(filters)}`, { headers: authHeaders(accessToken, tokenType) }),
      mocks.POLICIES,
    );
  },

  acceptPolicy(id, accessToken, tokenType) {
    return apiRequest(`/hr/onboarding/policies/${id}/accept`, {
      method: "POST",
      headers: authHeaders(accessToken, tokenType),
    });
  },
};

export default onboardingApi;
