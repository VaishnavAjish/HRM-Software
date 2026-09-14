import { EXPENSE_CATEGORIES } from "../models/expenseCategories";
import { sumExpenseLines } from "../utils/expenseCalculations";
import { formatCurrencyINR } from "../utils/formatters";

const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

/**
 * Section E — one editable line-item row per expense category (fixed 6,
 * from `expenseCategories.js`). The running-total footer is computed via
 * `expenseCalculations.sumExpenseLines` purely for the employee's own
 * on-screen reference while filling the form — it is NEVER submitted or
 * displayed anywhere as if it were the claim's authoritative total. Once a
 * claim exists server-side, every other view (ClaimSummaryCard,
 * ClaimDetailDrawer, ClaimsTable, …) reads the server's own
 * `totalClaimedAmount` / `totalApprovedAmount` instead.
 */
export default function ExpenseEditor({ lines, onChange, readOnly = false, error }) {
  const rows = EXPENSE_CATEGORIES.map((cat) => lines?.find((l) => l.category === cat.key) || { category: cat.key, amount: "", description: "" });

  const updateRow = (category, patch) => {
    if (readOnly) return;
    const next = rows.map((row) => (row.category === category ? { ...row, ...patch } : row));
    onChange?.(next);
  };

  const total = sumExpenseLines(rows);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3 text-left">Category</th>
              <th className="px-4 py-3 text-left">Amount (₹)</th>
              <th className="px-4 py-3 text-left">Description (optional)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-700 dark:bg-gray-800">
            {EXPENSE_CATEGORIES.map((cat) => {
              const row = rows.find((r) => r.category === cat.key);
              return (
                <tr key={cat.key}>
                  <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-100">{cat.label}</td>
                  <td className="px-4 py-2.5">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={`${inputClass} max-w-[160px]`}
                      value={row?.amount ?? ""}
                      onChange={(e) => updateRow(cat.key, { amount: e.target.value })}
                      disabled={readOnly}
                      placeholder="0.00"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      className={inputClass}
                      value={row?.description ?? ""}
                      onChange={(e) => updateRow(cat.key, { description: e.target.value })}
                      disabled={readOnly}
                      placeholder="Optional note"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-700/40">
              <td className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-200" colSpan={1}>
                Your Total
              </td>
              <td className="px-4 py-3 font-bold text-gray-900 dark:text-white" colSpan={2}>
                {formatCurrencyINR(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
        This total is for your reference only — the office calculates and approves the final amount.
      </p>
    </div>
  );
}
