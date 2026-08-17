import { useMemo } from "react";
import Card from "../../../components/ui/Card";

function Tile({ label, value, sub, subClass }) {
  return (
    <Card padding={false} className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{value ?? 0}</p>
      {sub && <p className={`mt-0.5 text-xs ${subClass || "text-gray-400"}`}>{sub}</p>}
    </Card>
  );
}

const TEAM_TYPES = new Set(["team", "section", "sub_department"]);

export default function KpiRow({ orgUnits, companies, summary, chart }) {
  const departmentCount = useMemo(
    () => orgUnits.filter((u) => u.type === "department" && u.status === "active").length,
    [orgUnits],
  );
  const teamCount = useMemo(
    () => orgUnits.filter((u) => TEAM_TYPES.has(u.type) && u.status === "active").length,
    [orgUnits],
  );
  // headcountSummary.filledHeadcount comes from OrganizationPosition rows,
  // which stay at zero until real positions/headcount targets exist —
  // there's no fabricated position data here. Real employee counts DO exist
  // (from the legacy department assignment sync), so this sums the chart's
  // own department node employeeCounts instead, the same real assignment
  // data the chart itself renders.
  const employeesActive = useMemo(
    () => (chart?.nodes || [])
      .filter((n) => n.type === "department")
      .reduce((sum, n) => sum + (n.employeeCount || 0), 0),
    [chart],
  );

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
      <Tile label="Companies" value={companies.length} />
      <Tile label="Departments" value={departmentCount} />
      <Tile label="Teams" value={teamCount} />
      <Tile
        label="Positions"
        value={summary?.positionCount}
        sub={summary ? `${summary.filledHeadcount ?? 0} Filled` : null}
        subClass="text-green-600 dark:text-green-400"
      />
      <Tile label="Employees Active" value={employeesActive} />
      <Tile
        label="Vacant Positions"
        value={summary?.vacantHeadcount}
        sub={summary?.vacantHeadcount > 0 ? "Needs attention" : null}
        subClass="text-amber-600 dark:text-amber-400"
      />
      <Tile label="Frozen Positions" value={summary?.frozenCount} />
    </div>
  );
}
