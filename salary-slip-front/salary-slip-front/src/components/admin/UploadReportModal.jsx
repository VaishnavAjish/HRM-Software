import Modal from "../ui/Modal";
import Badge from "../ui/Badge";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Curated columns per upload type — row_data carries many raw DB fields,
// this picks the ones worth showing in the report grid.
const COLUMNS_BY_TYPE = {
  salary: [
    { key: "emp_code", label: "Emp Code" },
    { key: "emp_name", label: "Name" },
    { key: "department", label: "Department" },
    { key: "month", label: "Month", format: (v) => MONTHS[parseInt(v, 10) - 1] || v },
    { key: "year", label: "Year" },
    { key: "net_salary", label: "Net Salary" },
  ],
  employee: [
    { key: "emp_code", label: "Emp Code" },
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "company_code", label: "Company" },
    { key: "department", label: "Department" },
  ],
  "account-master": [
    { key: "emp_code", label: "Emp Code" },
    { key: "bank_name", label: "Bank Name" },
    { key: "bank_account_no", label: "Account No" },
    { key: "bank_ifsc_code", label: "IFSC" },
  ],
};

function cellValue(row, col) {
  const raw = row.row_data?.[col.key];
  if (raw === undefined || raw === null || raw === "") return "—";
  return col.format ? col.format(raw) : String(raw);
}

export default function UploadReportModal({ isOpen, onClose, batch, type, loading }) {
  const columns = COLUMNS_BY_TYPE[type] || COLUMNS_BY_TYPE.employee;
  const rows = batch?.rows || [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title="Upload Report"
      footer={
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 w-full text-xs text-gray-500 dark:text-gray-400">
          <span>
            {batch ? `${batch.success_count} passed · ${batch.failed_count} failed · ${batch.total_rows} total rows` : ""}
          </span>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
          >
            Close
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Loading report...</div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">No rows recorded for this batch.</div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl">
          <table className="min-w-full text-xs border-collapse">
            <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2.5 text-left font-bold text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">#</th>
                {columns.map((col) => (
                  <th key={col.key} className="px-3 py-2.5 text-left font-bold text-gray-600 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-left font-bold text-gray-600 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700">Status</th>
                <th className="px-3 py-2.5 text-left font-bold text-gray-600 dark:text-gray-300">Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const passed = row.status === "passed";
                return (
                  <tr
                    key={row.id}
                    className={`border-t border-gray-200 dark:border-gray-700 ${
                      passed
                        ? "bg-green-50 dark:bg-green-900/15"
                        : "bg-red-50 dark:bg-red-900/15"
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-gray-400 border-r border-gray-200 dark:border-gray-700">{row.row_number}</td>
                    {columns.map((col) => (
                      <td key={col.key} className="px-3 py-2 text-gray-700 dark:text-gray-200 border-r border-gray-200 dark:border-gray-700 whitespace-nowrap max-w-[180px] truncate">
                        {cellValue(row, col)}
                      </td>
                    ))}
                    <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700">
                      <Badge variant={passed ? "green" : "red"}>{passed ? "Passed" : "Failed"}</Badge>
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.reason || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
