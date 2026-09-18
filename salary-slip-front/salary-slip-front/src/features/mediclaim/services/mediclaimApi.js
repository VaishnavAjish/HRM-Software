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

  // The two steps of the new-employee onboarding gate (read the rule book,
  // then add family members) — see RuleBookTab.jsx / FamilyMembersTab.jsx.
  acknowledgeRuleBook(accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/me/rule-book-acknowledge`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
    });
  },

  completeOnboarding(accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/me/onboarding-complete`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
    });
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

  /* -------------------------------------------------------- admin: intimations */

  // Company-wide "Notify Office" list — every employee's intimation, not
  // just the caller's own (`myIntimations` above stays self-scoped).
  adminIntimations(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/intimations${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  closeIntimation(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/intimations/${id}/close`, {
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

  // Hard delete — `Admin\ClaimController::destroy()` — gated on
  // `mediclaim.claim.delete`. See `ClaimsTab.jsx`'s Delete action.
  deleteClaim(claimId, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/claims/${claimId}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
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

  // Records the real discharge date once treatment that was still ongoing
  // at submission time has finished — see `ClaimDetailDrawer.jsx`'s
  // "mark as discharged" prompt and `ClaimWorkflowService::recordDischarge()`.
  recordClaimDischarge(claimId, dischargeAt, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/claims/${claimId}/discharge`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify({ discharge_at: dischargeAt }),
    });
  },

  // Simplified workflow's ongoing-treatment follow-up — records the real
  // discharge date AND the final expense line items together, once the
  // actual bill is known. See `ClaimDetailDrawer.jsx`'s "Finalize Treatment"
  // form and `ClaimWorkflowService::finalizeTreatment()`.
  // `expenses`: [{ category, description, claimedAmount, expenseDate }]
  finalizeTreatment(claimId, { dischargeAt, expenses }, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/claims/${claimId}/finalize-treatment`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify({
        discharge_at: dischargeAt,
        expenses: (expenses || []).map((row) => ({
          category: row.category,
          description: row.description || null,
          claimed_amount: row.claimedAmount,
          expense_date: row.expenseDate || null,
        })),
      }),
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

  // Required once per claim before managerDecision() will accept an
  // Approve/Reject/Return — the backend 409s (CONFIDENTIALITY_ACK_REQUIRED)
  // until this is called. See ManagerReviewPanel.jsx, which calls this
  // automatically right before submitReviewDecision() so the manager never
  // has to take a separate action for it.
  acknowledgeConfidentiality(claimId, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/claims/${claimId}/confidentiality-ack`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
    });
  },

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

  /* ----------------------------------------------------------------------- admin: employees */

  // Company-wide Mediclaim status across every active employee (not just
  // the ones with an existing enrollment row — see the backend
  // `Admin\EmployeeController` docblock). Each row carries a computed
  // `mediclaimStatus`: not_eligible | pending | completed.
  adminEmployees(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/admin/employees${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  adminEmployeeDetail(employeeId, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/admin/employees/${employeeId}`, { headers: headers(accessToken, tokenType) });
  },

  // Provisions coverage + issues a card for every eligible employee,
  // company-wide, in one pass — returns a {processed, issued, alreadyIssued,
  // notEligible, failed} summary.
  bulkIssueEmployeeCards(accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/admin/employees/bulk-issue-cards`, {
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

  // The hospital's "concern person" — name/designation/phone/email/photo.
  // FormData throughout (even without a photo) so create and update share
  // one shape and a later-added photo never needs a second code path.
  createHospitalContact(hospitalId, { name, designation, phone, email, availability, photo } = {}, accessToken, tokenType = "Bearer") {
    const formData = new FormData();
    formData.append("name", name);
    if (designation) formData.append("designation", designation);
    formData.append("phone", phone);
    if (email) formData.append("email", email);
    if (availability) formData.append("availability", availability);
    if (photo) formData.append("photo", photo);

    return apiRequest(`${BASE}/hospitals/${hospitalId}/contacts`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: formData,
    });
  },

  updateHospitalContact(hospitalId, contactId, { name, designation, phone, email, availability, photo } = {}, accessToken, tokenType = "Bearer") {
    const formData = new FormData();
    if (name !== undefined) formData.append("name", name);
    if (designation !== undefined) formData.append("designation", designation || "");
    if (phone !== undefined) formData.append("phone", phone);
    if (email !== undefined) formData.append("email", email || "");
    if (availability !== undefined) formData.append("availability", availability || "");
    if (photo) formData.append("photo", photo);

    return apiRequest(`${BASE}/hospitals/${hospitalId}/contacts/${contactId}`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: formData,
    });
  },

  deleteHospitalContact(hospitalId, contactId, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/hospitals/${hospitalId}/contacts/${contactId}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* --------------------------------------------------------------- document requirements (shared) */

  // Shared between the admin Document Settings screen and every employee's
  // document checklist — see `Admin\DocumentRequirementController`'s
  // docblock for why `.read` isn't split into an admin/self pair.
  documentRequirements(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/document-requirements${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createDocumentRequirement(payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/document-requirements`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateDocumentRequirement(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/document-requirements/${id}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  deleteDocumentRequirement(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/document-requirements/${id}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  /* ------------------------------------------------------------------- admin: rule book languages */

  ruleBookLanguages(filters = {}, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/rule-book-languages${query(filters)}`, { headers: headers(accessToken, tokenType) });
  },

  createRuleBookLanguage(payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/rule-book-languages`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateRuleBookLanguage(id, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/rule-book-languages/${id}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  deleteRuleBookLanguage(id, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/rule-book-languages/${id}`, {
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

  // Rule books hold their content as individual rule-text rows (added one
  // at a time) instead of an uploaded PDF — these four manage that list.
  addRuleBookItem(ruleBookId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/rule-books/${ruleBookId}/items`, {
      method: "POST",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  updateRuleBookItem(ruleBookId, itemId, payload, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/rule-books/${ruleBookId}/items/${itemId}`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify(payload),
    });
  },

  deleteRuleBookItem(ruleBookId, itemId, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/rule-books/${ruleBookId}/items/${itemId}`, {
      method: "DELETE",
      headers: headers(accessToken, tokenType),
    });
  },

  reorderRuleBookItems(ruleBookId, itemIds, accessToken, tokenType = "Bearer") {
    return apiRequest(`${BASE}/rule-books/${ruleBookId}/items-reorder`, {
      method: "PUT",
      headers: headers(accessToken, tokenType),
      body: JSON.stringify({ itemIds }),
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
