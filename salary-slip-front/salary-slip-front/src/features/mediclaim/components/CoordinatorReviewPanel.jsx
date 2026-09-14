import { useState } from "react";
import ReviewPanelShell from "./ReviewPanelShell";
import { useAuth } from "../../../context/AuthContext";
import { mediclaimApi } from "../services/mediclaimApi";
import { REVIEW_STAGE, REVIEW_STAGE_META, REVIEW_DECISION } from "../models/reviewStages";

/**
 * Mediclaim Coordinator verification (Section H) — Verified / Return for
 * Correction. Extra field: a "claim and documents verified" checkbox that
 * must be checked before a Verified decision can be submitted (enforced via
 * `extraValidate`, on top of `ReviewPanelShell`'s own remarks-required rule
 * from `claimValidation.validateReviewDecision`).
 */
export default function CoordinatorReviewPanel({ claim, onDecided }) {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (decision, remarks, fields) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await mediclaimApi.submitReviewDecision(
        claim?.id ?? claim?.claimId,
        { decision, remarks, documentsVerified: Boolean(fields.documentsVerified) },
        user?.accessToken,
        user?.tokenType,
      );
      onDecided?.(res?.data ?? null);
    } catch (err) {
      setError(err?.message || "Failed to submit the coordinator verification.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ReviewPanelShell
      claim={claim}
      stage={REVIEW_STAGE.COORDINATOR}
      decisionOptions={REVIEW_STAGE_META[REVIEW_STAGE.COORDINATOR].decisions}
      initialFields={{ documentsVerified: false }}
      extraValidate={(decision, fields) => {
        if (decision === REVIEW_DECISION.VERIFIED && !fields.documentsVerified) {
          return { documentsVerified: "Confirm the claim and documents are verified before submitting." };
        }
        return {};
      }}
      renderExtraFields={({ fields, setFieldValue, errors }) => (
        <div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={Boolean(fields.documentsVerified)}
              onChange={(e) => setFieldValue("documentsVerified", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600"
            />
            Claim and documents verified
          </label>
          {errors.documentsVerified && <p className="mt-1 text-xs text-red-500">{errors.documentsVerified}</p>}
        </div>
      )}
      onSubmit={handleSubmit}
      submitting={submitting}
      error={error}
    />
  );
}
