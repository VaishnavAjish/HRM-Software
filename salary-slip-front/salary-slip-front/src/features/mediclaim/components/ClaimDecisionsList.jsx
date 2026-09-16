import { useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { mediclaimApi } from "../services/mediclaimApi";
import { formatClaimDate, formatCurrencyINR } from "../utils/formatters";
import { getReviewStageMeta } from "../models/reviewStages";

/**
 * Read-only, stage-by-stage record of a claim's review decisions — who
 * decided what, when, and with what remarks — sourced from
 * `mediclaimApi.claimDecisions`. Distinct from `ClaimTimeline`: the
 * timeline is the full append-only workflow event log (submission,
 * assignment, return, settlement, etc.), while this is specifically the
 * Section H-K (+ Manager) decision records. Used inside
 * `ClaimDetailDrawer`.
 */
export default function ClaimDecisionsList({ claimId }) {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const requestKey = `${claimId ?? ""}|${accessToken ?? ""}|${tokenType ?? ""}`;
  const [result, setResult] = useState({ key: null, decisions: [], error: null });

  useEffect(() => {
    if (!claimId || !accessToken) return undefined;
    let cancelled = false;

    mediclaimApi.claimDecisions(claimId, accessToken, tokenType)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const decisions = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        setResult({ key: requestKey, decisions, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({ key: requestKey, decisions: [], error: err?.message || "Failed to load claim decisions." });
      });

    return () => { cancelled = true; };
  }, [claimId, accessToken, tokenType, requestKey]);

  const state = { loading: result.key !== requestKey, decisions: result.decisions, error: result.error };

  if (state.loading) {
    return <p className="py-6 text-center text-xs text-gray-400">Loading decisions…</p>;
  }
  if (state.error) {
    return <p className="py-6 text-center text-xs text-red-500">{state.error}</p>;
  }
  if (state.decisions.length === 0) {
    return <p className="py-6 text-center text-xs text-gray-400">No stage decisions recorded yet.</p>;
  }

  return (
    <div className="space-y-2">
      {state.decisions.map((entry, index) => {
        const stageMeta = getReviewStageMeta(entry.stage);
        const approvedAmount = entry.approvedAmount ?? entry.approved_amount ?? entry.fields?.approvedAmount;
        const decidedBy = entry.decidedByName || entry.decided_by_name || entry.actorName || entry.actor?.name;

        return (
          <div key={entry.id ?? index} className="rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {stageMeta?.label || entry.stage || "Decision"}
                {stageMeta?.sectionLabel && (
                  <span className="ml-1.5 text-[11px] font-normal text-gray-400">({stageMeta.sectionLabel})</span>
                )}
              </p>
              <span className="text-[11px] text-gray-400">
                {formatClaimDate(entry.decidedAt || entry.decided_at || entry.createdAt || entry.created_at)}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {entry.decision}
              {decidedBy && ` — by ${decidedBy}`}
            </p>
            {approvedAmount != null && (
              <p className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Approved Amount: {formatCurrencyINR(approvedAmount)}
              </p>
            )}
            {entry.remarks && <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{entry.remarks}</p>}
          </div>
        );
      })}
    </div>
  );
}
