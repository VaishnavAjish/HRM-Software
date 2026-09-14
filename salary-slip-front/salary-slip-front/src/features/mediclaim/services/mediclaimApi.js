import { apiRequest } from "../../../utils/api";

// Calling convention copied verbatim from
// `src/features/organization/services/organizationApi.js` — every function
// in this client follows the same `(...args, accessToken, tokenType)` shape
// and the same header/query builders, so pages that already know one
// feature's API client need nothing new to use this one.

function headers(accessToken, tokenType = "Bearer") {
  if (!accessToken) return {};
  const formattedType = tokenType
    ? tokenType.charAt(0).toUpperCase() + tokenType.slice(1)
    : "Bearer";
  return { Authorization: `${formattedType} ${accessToken}` };
}

function query(params = {}) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "" && value !== "ALL") {
      if (Array.isArray(value)) {
        value.forEach((item) => search.append(key, item));
      } else if (typeof value === "boolean") {
        // Laravel's `boolean` validation rule strictly accepts
        // true|false|0|1|'0'|'1' — NOT the strings "true"/"false" that
        // String(value) would produce, which fail validation with a 422.
        search.set(key, value ? "1" : "0");
      } else {
        search.set(key, String(value));
      }
    }
  });

  const string = search.toString();
  return string ? `?${string}` : "";
}

const BASE = "/v1/mediclaim";

export const mediclaimApi = {
  /* ------------------------------------------------- self-service: coverage & members */

  myCoverage(accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/me/coverage`, { headers: headers(accessToken, tokenType) });
  },

  myMembers(accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/me/members`, { headers: headers(accessToken, tokenType) });
  },

  memberChangeRequests(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/me/member-change-requests${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createMemberChangeRequest(payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/me/member-change-requests`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  /* -------------------------------------------------------------- self-service: cards */

  myCards(accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/me/cards`, { headers: headers(accessToken, tokenType) });
  },

  /* --------------------------------------------------------- self-service: intimations */

  myIntimations(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/me/intimations${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createIntimation(payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/me/intimations`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  /* -------------------------------------------------------------- self-service: claims */

  myClaims(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/me/claims${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createClaim(payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/me/claims`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  /* --------------------------------------------------------------------- team (manager) */

  teamClaims(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/team/claims${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  teamPendingApprovals(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/team/pending-approvals${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  /* ------------------------------------------------------------------------ admin: claims */

  // Bare admin claim list (company-scoped). Added per the plan's
  // reconciliation #3 — the natural index counterpart to `getClaim`, needed
  // by the admin "Claims" tab even though neither backend design pass
  // enumerated it up front.
  adminClaims(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/claims${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  /* --------------------------------------------------------------- claim resource (shared) */
  // Same endpoints serve the employee (own claim) and a reviewer, per the
  // backend's resource-scoped visibility rule — no separate admin/self split
  // on the client side.

  getClaim(claimId, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/claims/${claimId}`, { headers: headers(accessToken, tokenType) });
  },

  updateClaim(claimId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/claims/${claimId}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  submitClaim(claimId, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/claims/${claimId}/submit`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
    });
  },

  // Narrower than `submitReviewDecision` below — sends a claim back to the
  // employee from whichever stage currently holds it (see reconciliation #5).
  returnClaim(claimId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/claims/${claimId}/return`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  withdrawClaim(claimId, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/claims/${claimId}/withdraw`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
    });
  },

  /* ------------------------------------------------------------------------ claim documents */

  claimDocuments(claimId, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/claims/${claimId}/documents`, { headers: headers(accessToken, tokenType) });
  },

  // FormData body — deliberately no Content-Type header. apiRequest detects
  // a FormData body itself and leaves Content-Type off so the browser sets
  // its own multipart boundary, exactly like documentV1Api.upload in
  // src/utils/api.js.
  uploadClaimDocument(claimId, { file, documentType, description, idempotencyKey } = {}, accessToken, tokenType = "Bearer") {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("documentType", documentType);
    if (description) formData.append("description", description);

    return apiRequest(`${BASE}/claims/${claimId}/documents`, {
      method: "POST",
      headers: {
        ...headers(accessToken, tokenType),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: formData,
    });
  },

  /* ------------------------------------------------------------------- claim timeline & decisions */

  claimTimeline(claimId, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/claims/${claimId}/timeline`, { headers: headers(accessToken, tokenType) });
  },

  claimDecisions(claimId, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/claims/${claimId}/decisions`, { headers: headers(accessToken, tokenType) });
  },

  /* ---------------------------------------------------------------------------------- reviews */

  reviewsPending(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/reviews/pending${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  // One shared, stage-aware endpoint — the backend infers the claim's
  // current pending stage from its status server-side and never trusts a
  // client-supplied stage (reconciliation #5). `payload` carries
  // `{ decision, remarks, approvedAmount? }`.
  submitReviewDecision(claimId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/reviews/${claimId}/decision`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  /* --------------------------------------------------------------------------- admin: policies */

  policies(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/policies${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createPolicy(payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/policies`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updatePolicy(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/policies/${id}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  // Added in F6 — the B4 route table lists `POST
  // /policies/{policy}/versions/{version}/publish` but no client method for
  // it existed yet (F1 only wired create/update). Needed by the admin
  // Policies tab's version-publish action.
  publishPolicyVersion(policyId, versionId, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/policies/${policyId}/versions/${versionId}/publish`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
    });
  },

  /* ----------------------------------------------------------------------- admin: enrollments */

  enrollments(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/enrollments${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createEnrollment(payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/enrollments`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateEnrollment(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/enrollments/${id}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  /* ------------------------------------------------------------------------- admin: hospitals */

  hospitals(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/hospitals${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createHospital(payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/hospitals`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateHospital(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/hospitals/${id}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  // Added in F6 — the B4 route table lists `GET,POST,PUT,DELETE /hospitals`
  // but F1's client stopped at update. The admin Hospitals tab genuinely
  // needs delete (retiring a hospital that should no longer be shown as
  // network/cashless), per the plan's own flag that this method may be
  // missing.
  deleteHospital(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/hospitals/${id}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* ------------------------------------------------------------------------ admin: rule books */

  ruleBooks(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/rule-books${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createRuleBook(payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/rule-books`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateRuleBook(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/rule-books/${id}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  // Added in F6 — the B4 route table lists `POST /rule-books/{id}/publish`
  // but no client method for it existed yet. Needed by the admin Rule Books
  // tab's publish action (draft -> published, matching the Policies tab's
  // `publishPolicyVersion` shape).
  publishRuleBook(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/rule-books/${id}/publish`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
    });
  },

  /* ----------------------------------------------------------------- admin: reviewer assignments */

  reviewerAssignments(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/reviewer-assignments${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createReviewerAssignment(payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/reviewer-assignments`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateReviewerAssignment(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/reviewer-assignments/${id}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  deleteReviewerAssignment(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/reviewer-assignments/${id}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* ---------------------------------------------------------------------- admin: settlements */

  settlements(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/settlements${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  /* ------------------------------------------------------------------- admin: reports & audit */

  reports(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/reports${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  audit(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/audit${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  /* ------------------------------------------------------------------- public: card verification */

  // Unauthenticated by design (backend plan B6: outside `jwt.auth`, own
  // throttle). Deliberately takes no accessToken and builds no headers at
  // all — even a caller who happens to be logged in must never leak an
  // Authorization header onto this public, QR-code-reachable endpoint.
  verifyCard(token) {
    return apiRequest(`${BASE}/cards/verify/${encodeURIComponent(token)}`);
  },
};

export default mediclaimApi;
