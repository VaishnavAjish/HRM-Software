import { apiRequest } from "./api";

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

async function unwrap(request) {
  const res = await request();
  const payload = res?.data?.data ?? res?.data ?? res;
  return { data: payload, source: "api" };
}

export const onboardingApi = {
  getDashboard(accessToken, tokenType, filters = {}) {
    return unwrap(() =>
      apiRequest(`/hr/onboarding/dashboard${query(filters)}`, {
        headers: authHeaders(accessToken, tokenType),
      }),
    );
  },

  getJourneys(accessToken, tokenType, filters = {}) {
    return unwrap(() =>
      apiRequest(`/hr/onboarding/journeys${query(filters)}`, {
        headers: authHeaders(accessToken, tokenType),
      }),
    );
  },

  getDocuments(accessToken, tokenType, filters = {}) {
    return unwrap(() =>
      apiRequest(`/hr/onboarding/documents${query(filters)}`, {
        headers: authHeaders(accessToken, tokenType),
      }),
    );
  },

  reviewDocument(id, decision, remarks, accessToken, tokenType) {
    return apiRequest(`/hr/onboarding/documents/${id}/${decision}`, {
      method: "POST",
      headers: authHeaders(accessToken, tokenType),
      body: JSON.stringify({ remarks }),
    });
  },
};

export default onboardingApi;
