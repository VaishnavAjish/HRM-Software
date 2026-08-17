import { Building2 } from "lucide-react";
import OrgWorkspaceTabs from "../../../features/organization/components/OrgWorkspaceTabs";
import OverviewTab from "./organization/OverviewTab";
import PromotionTransferTab from "./organization/PromotionTransferTab";
import OrgChartPage from "../organization/OrgChart";
import PositionsPage from "../organization/Positions";
import AssignmentsPage from "../organization/Assignments";
import DesignationsPage from "../workforce/DesignationsPage";
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
// Companies/Units/Departments/Department Managers moved here from Access
// Control's single combined "Company & Unit" page (which now redirects to
// the Companies tab here, see App.jsx) as four separate top-level tabs
// rather than a second nested tab bar inside one — each is the same
// CompanyUnits component pinned to a different internal tab via
// initialTab/hideTabs. They keep their own admin.company.read permission
// rather than an org.* one: that gate is deliberately narrower (super-admin
// only) because a company code is the tenant key, and moving the page must
// not widen who can touch it.
//
// The old "Departments" tab (org.unit.read, OrgUnitsPage) and "Governance"
// tab (org.change.read, GovernanceTab) were removed — the former managed
// organization_units, which had no real data and duplicated the "Company &
// Unit" Departments tab's role; "Departments" now refers to the real one.
const TABS = [
  { key: "overview", label: "Overview", permission: "org.unit.read", render: () => <OverviewTab /> },
  { key: "companies", label: "Companies", permission: "admin.company.read", render: () => <CompanyUnits initialTab="companies" hideTabs /> },
  { key: "units", label: "Units", permission: "admin.company.read", render: () => <CompanyUnits initialTab="units" hideTabs /> },
  { key: "departments", label: "Departments", permission: "admin.company.read", render: () => <CompanyUnits initialTab="departments" hideTabs /> },
  { key: "department-managers", label: "Department Managers", permission: "admin.company.read", render: () => <CompanyUnits initialTab="department_managers" hideTabs /> },
  { key: "org-chart", label: "Org Chart", permission: "org.chart.read", render: () => <OrgChartPage /> },
  { key: "positions", label: "Positions", permission: "org.unit_position.read", render: () => <PositionsPage /> },
  { key: "designations", label: "Designations", permission: "workforce.designation.read", render: () => <DesignationsPage /> },
  { key: "assignments", label: "Assignments", permission: "org.unit_assignment.read", render: () => <AssignmentsPage /> },
  { key: "promotions-transfers", label: "Promotions & Transfers", permission: "org.change.read", render: () => <PromotionTransferTab /> },
];

export default function HrOrganization() {
  return (
    <div className="min-w-0 max-w-full space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
          <Building2 size={20} /> Organization
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage companies, units, departments, positions, designations, reporting structure and
          promotions/transfers — the same data as the Organization, Access Control and Workforce modules.
        </p>
      </div>
      <OrgWorkspaceTabs tabs={TABS} />
    </div>
  );
}
