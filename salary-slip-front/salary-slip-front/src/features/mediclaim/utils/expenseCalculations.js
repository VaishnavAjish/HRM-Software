/**
 * Client-side expense totals — for the ExpenseEditor's (F4) on-screen
 * "running total" UX only.
 *
 * The server recalculates expense totals from scratch on every submit and
 * is authoritative for `totalAmount` / `approvedAmount` (see the backend
 * plan's `ClaimWorkflowService::submit`, which explicitly "never trusts
 * client totals"). Never persist or submit either of these values as if it
 * were the claim total, and never display them anywhere outside the wizard
 * itself once a claim has a server-assigned id — every other view must read
 * the server's own totals.
 */

export function sumExpenseLines(lines = []) {
  return (Array.isArray(lines) ? lines : []).reduce((total, line) => {
    const amount = Number(line?.amount);
    return total + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);
}

export function sumExpensesByCategory(lines = []) {
  return (Array.isArray(lines) ? lines : []).reduce((byCategory, line) => {
    const amount = Number(line?.amount);
    const category = line?.category;
    if (!category || !Number.isFinite(amount)) return byCategory;
    byCategory[category] = (byCategory[category] || 0) + amount;
    return byCategory;
  }, {});
}
