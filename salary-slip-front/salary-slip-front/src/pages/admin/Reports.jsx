import { BarChart3 } from "lucide-react";

/**
 * Reporting is not yet backed by live data.
 *
 * This page previously rendered charts, a department table and Excel/PDF
 * exports built entirely from src/data/mockData.js — an admin could "export" a
 * salary report of fabricated figures and get a success toast. Presenting
 * invented payroll as real is a data-integrity and trust risk, so until the
 * reporting endpoints exist this shows an honest unavailable state and exports
 * nothing. Wire it to authenticated, company-scoped report APIs before
 * re-enabling charts/exports.
 */
export default function Reports() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          Reports
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Payroll, attendance and headcount reporting.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 py-20 px-6">
        <BarChart3 className="w-10 h-10 text-gray-400 mb-4" aria-hidden="true" />
        <h2 className="text-lg font-medium text-gray-800 dark:text-gray-100">
          Reports are not available yet
        </h2>
        <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
          This section is being connected to live payroll and attendance data.
          It will show real figures once the reporting endpoints are in place.
          No sample or estimated numbers are shown here.
        </p>
      </div>
    </div>
  );
}
