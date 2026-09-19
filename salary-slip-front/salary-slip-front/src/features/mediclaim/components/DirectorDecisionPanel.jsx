import { useState } from "react";
import ReviewPanelShell from "./ReviewPanelShell";
import { useAuth } from "../../../context/AuthContext";
import { mediclaimApi } from "../services/mediclaimApi";
import { REVIEW_STAGE, REVIEW_STAGE_META, REVIEW_DECISION } from "../models/reviewStages";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

/**
 * Director final approval (Section K) — Approved / Partially Approved /
 * Rejected. Extra field: Approved Amount, required unless the decision is
 * Rejected and validated (by `claimValidation.validateReviewDecision`,
 * driven by `REVIEW_STAGE_META[DIRECTOR].requiresApprovedAmountUnless`) to
 * never exceed the claim's `totalClaimedAmount` (see `ClaimSummaryCard`/
 * `ClaimsTable`/`MyClaimsTab` for the established `totalClaimedAmount` /
 * `total_claimed_amount` field-naming convention this panel follows).
 *
 * The field is hidden once Rejected is picked (nothing to validate or
 * send), and omitted from the payload in that case rather than sent as an
 * empty string.
 */
export default function DirectorDecisionPanel({ claim, onDecided }) {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (decision, remarks, fields) => {
    setSubmitting(true);
    setError(null);
    const payload = { decision, remarks };
    if (decision !== REVIEW_DECISION.REJECTED) {
      const amt = (fields.approvedAmount !== "" && fields.approvedAmount !== undefined && !Number.isNaN(Number(fields.approvedAmount)))
        ? Number(fields.approvedAmount)
        : (Number(claim?.totalClaimedAmount ?? claim?.total_claimed_amount) || 0);
      payload.approvedAmount = amt;
      payload.approved_amount = amt;
    }
    try {
      const res = await mediclaimApi.submitReviewDecision(
        claim?.id ?? claim?.claimId,
        payload,
        user?.accessToken,
        user?.tokenType,
      );
      onDecided?.(res?.data ?? null);
    } catch (err) {
      setError(err?.message || "Failed to submit the director decision.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ReviewPanelShell
      claim={claim}
      stage={REVIEW_STAGE.DIRECTOR}
      decisionOptions={REVIEW_STAGE_META[REVIEW_STAGE.DIRECTOR].decisions}
      initialFields={{ approvedAmount: "" }}
      renderExtraFields={({ decision, fields, setFieldValue, errors }) =>
        decision !== REVIEW_DECISION.REJECTED && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
              Approved Amount (₹)<span className="text-red-500"> *</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
              value={fields.approvedAmount}
              onChange={(e) => setFieldValue("approvedAmount", e.target.value)}
            />
            {errors.approvedAmount && <p className="mt-1 text-xs text-red-500">{errors.approvedAmount}</p>}
          </div>
        )
      }
      onSubmit={handleSubmit}
      submitting={submitting}
      error={error}
    />
  );
}
