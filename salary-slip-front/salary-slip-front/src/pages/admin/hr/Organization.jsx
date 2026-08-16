import { Building2 } from "lucide-react";
import OrgWorkspaceTabs from "../../../features/organization/components/OrgWorkspaceTabs";
import OverviewTab from "./organization/OverviewTab";
import PromotionTransferTab from "./organization/PromotionTransferTab";
import GovernanceTab from "./organization/GovernanceTab";
import OrgUnitsPage from "../organization/OrgUnits";
import OrgChartPage from "../organization/OrgChart";
import PositionsPage from "../organization/Positions";
import AssignmentsPage from "../organization/Assignments";
import DesignationsPage from "../workforce/DesignationsPage";

// HR Organization Hierarchy Workspace (/admin/hr/organization).
//
// Every tab reuses an existing Organization (Domain 02) or Workforce
// (Domain 03) page/component verbatim — there is no HR-only department,
// designation, org-chart or position data model here. Promotions/Transfers
// and Governance are the only two tabs with HR-specific composition, and
// even those are thin wrappers around the same organizationApi/
// OrganizationChangeManagement machinery the Organization module itself
// uses, so a change made here shows up in /admin/organization/* too.
const TABS = [
  { key: "overview", label: "Overview", permission: "org.unit.read", render: () => <OverviewTab /> },
  { key: "departments", label: "Departments", permission: "org.unit.read", render: () => <OrgUnitsPage /> },
  { key: "org-chart", label: "Org Chart", permission: "org.chart.read", render: () => <OrgChartPage /> },
  { key: "positions", label: "Positions", permission: "org.unit_position.read", render: () => <PositionsPage /> },
  { key: "designations", label: "Designations", permission: "workforce.designation.read", render: () => <DesignationsPage /> },
  { key: "assignments", label: "Assignments", permission: "org.unit_assignment.read", render: () => <AssignmentsPage /> },
  { key: "promotions-transfers", label: "Promotions & Transfers", permission: "org.change.read", render: () => <PromotionTransferTab /> },
  { key: "governance", label: "Governance", permission: "org.change.read", render: () => <GovernanceTab /> },
];

export default function HrOrganization() {
  return (
    <div className="min-w-0 max-w-full space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
          <Building2 size={20} /> Organization
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage departments, positions, designations, reporting structure and promotions/transfers
          for HR — the same data as the Organization and Workforce modules.
        </p>
      </div>
      <OrgWorkspaceTabs tabs={TABS} />
    </div>
  );
}
