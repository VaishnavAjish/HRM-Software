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
 * Rendered from both the employee workspace's `Pending My Approval` tab and
 * the admin workspace's Pending Reviews tab (the latter via
 * `PendingReviewsTab.jsx`'s `STAGE_PANEL[REVIEW_STAGE.MANAGER]`).
 *
 * `ClaimWorkflowService::managerDecision()` refuses every decision with a
 * 409 (`CONFIDENTIALITY_ACK_REQUIRED`) until
 * `POST /claims/{claim}/confidentiality-ack` has been called at least once
 * for this claim — there was never a UI step for that anywhere, so every
 * manager decision was silently failing. Rather than adding a separate
 * "acknowledge" click the user has to remember, this calls it automatically,
 * immediately before the decision itself, on every submit (idempotent on
 * the backend — re-acknowledging just refreshes the timestamp).
 */
export default function ManagerReviewPanel({ claim, onDecided }) {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (decision, remarks) => {
    setSubmitting(true);
    setError(null);
    const claimId = claim?.id ?? claim?.claimId;
    try {
      await mediclaimApi.acknowledgeConfidentiality(claimId, user?.accessToken, user?.tokenType);
      const res = await mediclaimApi.submitReviewDecision(
        claimId,
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
