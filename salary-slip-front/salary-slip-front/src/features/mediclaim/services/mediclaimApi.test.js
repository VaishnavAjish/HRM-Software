import { describe, expect, it, vi } from "vitest";
import { mediclaimApi } from "./mediclaimApi";

function mockFetchOnce(body = { success: true, data: {} }) {
  const fetchMock = vi.fn(() => Promise.resolve({
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    text: () => Promise.resolve(JSON.stringify(body)),
  }));
  globalThis.fetch = fetchMock;
  return fetchMock;
}

// Regression guard: every later Mediclaim phase (F3-F8) calls into this
// client — if a phase renames or drops a function here, every page built on
// top of it breaks silently at call time instead of at build time.
describe("mediclaimApi", () => {
  it("exports every function the Mediclaim feature plan's F1 method list requires", () => {
    const expectedFunctions = [
      "myCoverage", "myMembers",
      "memberChangeRequests", "createMemberChangeRequest",
      "myCards",
      "myIntimations", "createIntimation",
      "myClaims", "createClaim",
      "teamClaims", "teamPendingApprovals",
      "adminClaims",
      "getClaim", "updateClaim", "submitClaim", "returnClaim", "withdrawClaim",
      "claimDocuments", "uploadClaimDocument",
      "claimTimeline", "claimDecisions",
      "reviewsPending", "submitReviewDecision",
      "policies", "createPolicy", "updatePolicy",
      "enrollments", "createEnrollment", "updateEnrollment",
      "hospitals", "createHospital", "updateHospital",
      "ruleBooks", "createRuleBook", "updateRuleBook",
      "reviewerAssignments", "createReviewerAssignment", "updateReviewerAssignment", "deleteReviewerAssignment",
      "settlements",
      "reports",
      "audit",
      "verifyCard",
    ];

    for (const fn of expectedFunctions) {
      expect(typeof mediclaimApi[fn]).toBe("function");
    }
  });

  it("requests the employee's own claims from the /me/claims endpoint with an auth header", async () => {
    const fetchMock = mockFetchOnce();

    await mediclaimApi.myClaims({}, "test-token", "Bearer");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("/v1/mediclaim/me/claims");
    expect(options.method ?? "GET").toBe("GET");
    expect(options.headers.Authorization).toBe("Bearer test-token");
  });

  it("builds query strings for list filters the same way organizationApi does (skips ALL/empty, encodes booleans as 1/0)", async () => {
    const fetchMock = mockFetchOnce();

    await mediclaimApi.adminClaims(
      { status: "ALL", search: "", stage: "COORDINATOR", onlyOverdue: true, includeClosed: false },
      "test-token",
    );

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("stage=COORDINATOR");
    expect(url).toContain("onlyOverdue=1");
    expect(url).toContain("includeClosed=0");
    expect(url).not.toContain("status=");
    expect(url).not.toContain("search=");
  });

  it("posts a new claim draft to /me/claims with a JSON body", async () => {
    const fetchMock = mockFetchOnce();
    const payload = { memberId: 42, treatmentType: "opd" };

    await mediclaimApi.createClaim(payload, "test-token");

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("/v1/mediclaim/me/claims");
    expect(options.method).toBe("POST");
    expect(options.body).toBe(JSON.stringify(payload));
    expect(options.headers.Authorization).toBe("Bearer test-token");
  });

  it("submits a stage-aware review decision to /reviews/{claim}/decision", async () => {
    const fetchMock = mockFetchOnce();
    const payload = { decision: "VERIFIED", remarks: "" };

    await mediclaimApi.submitReviewDecision(101, payload, "test-token");

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("/v1/mediclaim/reviews/101/decision");
    expect(options.method).toBe("POST");
    expect(options.body).toBe(JSON.stringify(payload));
  });

  it("uploads a claim document as FormData with no Content-Type override", async () => {
    const fetchMock = mockFetchOnce();
    const file = new File(["contents"], "bill.pdf", { type: "application/pdf" });

    await mediclaimApi.uploadClaimDocument(7, { file, documentType: "HOSPITAL_BILL" }, "test-token");

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("/v1/mediclaim/claims/7/documents");
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get("documentType")).toBe("HOSPITAL_BILL");
    // Only Authorization is set by this client's own headers() — apiRequest
    // itself skips Content-Type for a FormData body so the browser can set
    // its own multipart boundary.
    expect(options.headers.Authorization).toBe("Bearer test-token");
    expect(options.headers["Content-Type"]).toBeUndefined();
  });

  it("sends NO Authorization header (and takes no accessToken) when verifying a card by public QR token", async () => {
    const fetchMock = mockFetchOnce({ valid: true, member_name: "Test Employee" });

    // Deliberately called with only one argument — verifyCard's signature
    // has no accessToken parameter at all.
    await mediclaimApi.verifyCard("plain-qr-token-abc123");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("/v1/mediclaim/cards/verify/plain-qr-token-abc123");
    expect(options.headers?.Authorization).toBeUndefined();
  });
});
