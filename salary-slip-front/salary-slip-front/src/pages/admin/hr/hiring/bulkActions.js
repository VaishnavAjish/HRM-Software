import toast from "react-hot-toast";

/**
 * There is no bulk backend endpoint for any of these actions — this loops
 * the existing single-record endpoint over every selected id and reports a
 * combined result, so it stays fully compatible with the current API
 * surface instead of inventing a new one.
 */
export async function runBulk(ids, fn, { successLabel = "updated", onDone } = {}) {
  if (!ids.length) return;
  const results = await Promise.allSettled(ids.map((id) => fn(id)));
  const ok = results.filter((r) => r.status === "fulfilled" && r.value?.status).length;
  const failed = ids.length - ok;

  if (ok > 0) toast.success(`${ok} ${successLabel}${failed ? `, ${failed} failed` : ""}`);
  else toast.error(`Failed to update ${failed} item${failed === 1 ? "" : "s"}`);

  onDone?.();
}
