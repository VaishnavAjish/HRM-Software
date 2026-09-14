import { useState } from "react";
import ReviewPanelShell from "./ReviewPanelShell";
import { useAuth } from "../../../context/AuthContext";
import { mediclaimApi } from "../services/mediclaimApi";
import { REVIEW_STAGE, REVIEW_STAGE_META } from "../models/reviewStages";

/**
 * Mediclaim Committee recommendation (Section I) — Recommended / Not
 * Recommended. No stage-specific extra fields; remarks are required for Not
 * Recommended purely via `claimValidation.validateReviewDecision`'s
 * clean-approve rule (`Recommended` is in `CLEAN_APPROVE_DECISIONS`, `Not
 * Recommended` is not), so no `extraValidate` is needed here.
 */
export default function CommitteeReviewPanel({ claim, onDecided }) {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (decision, remarks) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await mediclaimApi.submitReviewDecision(
        claim?.id ?? claim?.claimId,
        { decision, remarks },
        user?.accessToken,
        user?.tokenType,
      );
      onDecided?.(res?.data ?? null);
    } catch (err) {
      setError(err?.message || "Failed to submit the committee recommendation.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ReviewPanelShell
      claim={claim}
      stage={REVIEW_STAGE.COMMITTEE}
      decisionOptions={REVIEW_STAGE_META[REVIEW_STAGE.COMMITTEE].decisions}
      onSubmit={handleSubmit}
      submitting={submitting}
      error={error}
    />
  );
}
