import { describe, expect, it, vi } from "vitest";
import { organizationApi } from "./organizationApi";

// Regression guard: the promotion/transfer work only ever *adds* a function
// to this shared client — every existing Organization/Workforce page
// (StructureWorkspace, OrgChartWorkspace, PositionsWorkspace,
// JobArchitectureWorkspace, GovernanceWorkspace, etc.) keeps working only if
// the functions they already call are still exported with the same shape.
describe("organizationApi", () => {
  it("still exports every function the existing Organization workspaces call", () => {
    const expectedFunctions = [
      // org units / positions / assignments (Structure, Positions workspaces)
      "orgUnits", "orgUnitOptions", "createOrgUnit", "getOrgUnit", "updateOrgUnit",
      "setOrgUnitStatus", "deleteOrgUnit", "orgUnitPositions", "createOrgUnitPosition",
      "updateOrgUnitPosition", "freezeOrgUnitPosition", "releaseOrgUnitPosition",
      "deleteOrgUnitPosition", "headcountSummary", "orgUnitAssignments",
      "createOrgUnitAssignment", "updateOrgUnitAssignment", "deleteOrgUnitAssignment",
      // org chart
      "orgChart",
      // change management (Governance workspace)
      "orgChanges", "createOrgChange", "getOrgChange", "updateOrgChange", "submitOrgChange",
      "approveOrgChange", "rejectOrgChange", "cancelOrgChange", "scheduleOrgChange",
      "applyOrgChange", "orgChangeItems", "createOrgChangeItem", "orgChangeApprovals",
      "orgChangeImpact",
      // reporting structure (Governance workspace)
      "reportingRelationships", "createReportingRelationship", "updateReportingRelationship",
      "deleteReportingRelationship", "reportingChain",
      // entities/enterprises (Entities workspace)
      "enterprises", "enterpriseCompanies", "getEnterprise", "createEnterprise",
      // legacy locations, used by the promotion/transfer form for "target location"
      "locations", "financialOrganizations",
      // the new promotion/transfer entry point
      "createPromotionTransfer",
    ];

    for (const fn of expectedFunctions) {
      expect(typeof organizationApi[fn]).toBe("function");
    }
  });

  it("posts a promotion/transfer draft to the dedicated convenience endpoint", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      status: 201,
      headers: { get: () => "application/json" },
      text: () => Promise.resolve(JSON.stringify({ success: true, data: { id: 1 } })),
    }));

    await organizationApi.createPromotionTransfer(
      { employeeId: 1, organizationUnitId: 2 },
      "test-token",
      "Bearer",
    );

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("/v1/admin/organization/org-changes/promotion-transfer");
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer test-token");

    globalThis.fetch = originalFetch;
  });
});
