import { useMemo, useState } from "react";
import ChangeManagementPage from "../../organization/ChangeManagement";
import ReportingStructurePage from "../../organization/ReportingStructure";
import CalendarsPage from "../../organization/Calendars";
import CalendarAssignmentsPage from "../../organization/CalendarAssignments";
import { useAuthorization } from "../../../../hooks/useAuthorization";

// Composes the same underlying pages the old standalone Organization module
// used, but with its own local (non-URL) tab state — nesting OrgWorkspaceTabs
// here would collide with the outer HR Organization workspace's own `?tab=`
// query param, since both would read and write the same key.
const SUB_TABS = [
  { key: "changes", label: "Change Management", permission: "org.change.read", render: () => <ChangeManagementPage /> },
  { key: "reporting", label: "Reporting Structure", permission: "org.reporting.read", render: () => <ReportingStructurePage /> },
  { key: "calendars", label: "Calendars", permission: "org.calendar.read", render: () => <CalendarsPage /> },
  { key: "calendar-assignments", label: "Calendar Assignments", permission: "org.calendar_assignment.read", render: () => <CalendarAssignmentsPage /> },
];

export default function GovernanceTab() {
  const { can } = useAuthorization();
  const available = useMemo(() => SUB_TABS.filter((t) => !t.permission || can(t.permission)), [can]);
  const [active, setActive] = useState(available[0]?.key ?? null);

  const current = available.find((t) => t.key === active) || available[0];

  if (available.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
        You do not have access to any section of Governance.
      </p>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2 dark:border-gray-700">
        {available.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              current?.key === tab.key
                ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {current?.render()}
    </div>
  );
}
