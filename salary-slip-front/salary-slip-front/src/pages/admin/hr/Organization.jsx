import OrgWorkspaceTabs from "../../../features/organization/components/OrgWorkspaceTabs";
import OverviewTab from "./organization/OverviewTab";
import PromotionTransferTab from "./organization/PromotionTransferTab";
import OrgChartPage from "../organization/OrgChart";
import PositionsPage from "../organization/Positions";
import AssignmentsPage from "../organization/Assignments";
import CompanyUnits from "../accessControl/CompanyUnits";

// HR Organization Hierarchy Workspace (/admin/hr/organization).
//
// Every tab reuses an existing Organization (Domain 02) or Workforce
// (Domain 03) page/component verbatim — there is no HR-only department,
// designation, org-chart or position data model here. Promotions/Transfers
// is the only tab with HR-specific composition, and even that is a thin
// wrapper around the same organizationApi/OrganizationChangeManagement
// machinery the Organization module itself uses, so a change made here
// shows up in /admin/organization/* too.
//
// Companies/Departments moved here from Access Control's single combined
// "Company & Unit" page (which now redirects to the Companies tab here,
// see App.jsx) as separate top-level tabs rather than a second nested tab
// bar inside one — each is the same CompanyUnits component pinned to a
// different internal tab via initialTab/hideTabs. Units (branches) don't
// get their own tab — they're nested directly under each company row on
// the Companies tab, since a unit only ever makes sense in the context of
// the one company it belongs to. Department Managers doesn't get its own
// tab either — assigning/removing a department's manager(s) now happens
// inline on the Departments tab (a "+" action per row, plus an "x" on each
// manager chip), so managing a department and managing who manages it is
// one workflow instead of two disconnected tabs. They keep their own
// admin.company.read permission rather than an org.* one: that gate is
// deliberately narrower (super-admin only) because a company code is the
// tenant key, and moving the page must not widen who can touch it.
//
// The old "Departments" tab (org.unit.read, OrgUnitsPage) and "Governance"
// tab (org.change.read, GovernanceTab) were removed — the former managed
// organization_units, which had no real data and duplicated the "Company &
// Unit" Departments tab's role; "Departments" now refers to the real one.
const TABS = [
  { key: "overview", label: "Overview", permission: "org.unit.read", render: () => <OverviewTab /> },
  { key: "companies", label: "Companies", permission: "admin.company.read", render: () => <CompanyUnits key="companies" initialTab="companies" hideTabs /> },
  { key: "departments", label: "Departments", permission: "admin.company.read", render: () => <CompanyUnits key="departments" initialTab="departments" hideTabs /> },
  { key: "positions", label: "Designations", permission: "org.unit_position.read", render: () => <PositionsPage /> },
  { key: "org-chart", label: "Org Chart", permission: "org.chart.read", render: () => <OrgChartPage /> },
  { key: "assignments", label: "Assignments", permission: "org.unit_assignment.read", render: () => <AssignmentsPage /> },
  { key: "promotions-transfers", label: "Promotions & Transfers", permission: "org.change.read", render: () => <PromotionTransferTab /> },
];

export default function HrOrganization() {
  return (
    <div className="min-w-0 max-w-full space-y-4">
      <OrgWorkspaceTabs tabs={TABS} />
    </div>
  );
}
