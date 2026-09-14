import { useState } from "react";
import ReviewPanelShell from "./ReviewPanelShell";
import { useAuth } from "../../../context/AuthContext";
import { mediclaimApi } from "../services/mediclaimApi";
import { REVIEW_STAGE, REVIEW_STAGE_META, REVIEW_DECISION } from "../models/reviewStages";

/**
 * HR Eligibility verification (Section J) — Verified / Return for
 * Correction. Two extra checkboxes — employee eligibility and policy
 * applicability — both required before a Verified decision can be
 * submitted.
 */
export default function HrEligibilityReviewPanel({ claim, onDecided }) {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (decision, remarks, fields) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await mediclaimApi.submitReviewDecision(
        claim?.id ?? claim?.claimId,
        {
          decision,
          remarks,
          eligibilityVerified: Boolean(fields.eligibilityVerified),
          policyApplicabilityVerified: Boolean(fields.policyApplicabilityVerified),
        },
        user?.accessToken,
        user?.tokenType,
      );
      onDecided?.(res?.data ?? null);
    } catch (err) {
      setError(err?.message || "Failed to submit the HR eligibility verification.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ReviewPanelShell
      claim={claim}
      stage={REVIEW_STAGE.HR_ELIGIBILITY}
      decisionOptions={REVIEW_STAGE_META[REVIEW_STAGE.HR_ELIGIBILITY].decisions}
      initialFields={{ eligibilityVerified: false, policyApplicabilityVerified: false }}
      extraValidate={(decision, fields) => {
        if (decision !== REVIEW_DECISION.VERIFIED) return {};
        const errors = {};
        if (!fields.eligibilityVerified) {
          errors.eligibilityVerified = "Confirm employee eligibility is verified before submitting.";
        }
        if (!fields.policyApplicabilityVerified) {
          errors.policyApplicabilityVerified = "Confirm policy applicability is verified before submitting.";
        }
        return errors;
      }}
      renderExtraFields={({ fields, setFieldValue, errors }) => (
        <div className="space-y-2">
          <div>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                checked={Boolean(fields.eligibilityVerified)}
                onChange={(e) => setFieldValue("eligibilityVerified", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600"
              />
              Employee eligibility verified
            </label>
            {errors.eligibilityVerified && <p className="mt-1 text-xs text-red-500">{errors.eligibilityVerified}</p>}
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                checked={Boolean(fields.policyApplicabilityVerified)}
                onChange={(e) => setFieldValue("policyApplicabilityVerified", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600"
              />
              Policy applicability verified
            </label>
            {errors.policyApplicabilityVerified && (
              <p className="mt-1 text-xs text-red-500">{errors.policyApplicabilityVerified}</p>
            )}
          </div>
        </div>
      )}
      onSubmit={handleSubmit}
      submitting={submitting}
      error={error}
    />
  );
}
