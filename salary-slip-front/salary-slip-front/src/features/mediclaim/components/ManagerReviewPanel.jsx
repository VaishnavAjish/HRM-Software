import { useState } from "react";
import ReviewPanelShell from "./ReviewPanelShell";
import { useAuth } from "../../../context/AuthContext";
import { mediclaimApi } from "../services/mediclaimApi";
import { REVIEW_STAGE, REVIEW_STAGE_META } from "../models/reviewStages";

/**
 * Manager decision on a claim currently in `MANAGER_REVIEW` — Approve /
 * Reject / Return for Correction. No stage-specific extra fields, so this
 * is the thinnest of the five wrappers.
 *
 * Used from the employee workspace's `Pending My Approval` tab (F5) — the
 * admin workspace's Pending Reviews tab (F6) never renders this panel;
 * manager decisions are made only from the employee-side Team tabs, per
 * `models/reviewStages.js`'s `STAGE_DECIDE_PERMISSIONS` note.
 */
export default function ManagerReviewPanel({ claim, onDecided }) {
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
      setError(err?.message || "Failed to submit the manager decision.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ReviewPanelShell
      claim={claim}
      stage={REVIEW_STAGE.MANAGER}
      decisionOptions={REVIEW_STAGE_META[REVIEW_STAGE.MANAGER].decisions}
      onSubmit={handleSubmit}
      submitting={submitting}
      error={error}
    />
  );
}
