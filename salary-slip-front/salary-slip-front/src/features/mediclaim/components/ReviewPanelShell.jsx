import { useMemo, useState } from "react";
import Button from "../../../components/ui/Button";
import ClaimSummaryCard from "./ClaimSummaryCard";
import { validateReviewDecision } from "../utils/claimValidation";
import { getReviewStageMeta } from "../models/reviewStages";

const textareaClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

/**
 * Shared chrome for every stage review panel (F5): claim summary header, a
 * row of decision buttons, any stage-specific extra fields, a remarks
 * textarea, and a Submit action. This component owns no network logic at
 * all — it is pure controlled UI, exactly mirroring the plan's prop shape
 * (`onSubmit(decision, remarks, extraFields)` + `submitting`/`error` passed
 * in from the caller). Each of the five stage panels (`ManagerReviewPanel`,
 * `CoordinatorReviewPanel`, `CommitteeReviewPanel`,
 * `HrEligibilityReviewPanel`, `DirectorDecisionPanel`) is the thing that
 * actually calls `mediclaimApi.submitReviewDecision` and manages its own
 * `submitting`/`error` state, then hands this shell a plain callback.
 *
 * Validation is delegated entirely to
 * `claimValidation.validateReviewDecision({ stage, decision, remarks,
 * approvedAmount, claimedTotal })` — this component never reimplements the
 * "remarks required unless a clean approve" or "approved amount required
 * unless Director-Rejected" rules, it only renders whatever errors that
 * validator returns and disables Submit until they clear. Stage-specific
 * extra requirements that validator doesn't know about (Coordinator's
 * verified checkbox, HR Eligibility's two checkboxes) are supplied by the
 * wrapping panel via `extraValidate(decision, fields)`, whose returned
 * errors are merged in the same way.
 *
 * Props:
 *  - claim: the claim object, rendered via `ClaimSummaryCard`.
 *  - stage: a `REVIEW_STAGE` value.
 *  - decisionOptions: `[{ value, label }]` — the panel's own decision
 *    vocabulary (`REVIEW_STAGE_META[stage].decisions` in every current
 *    call site, but passed explicitly so a panel could override it).
 *  - initialFields: initial state for stage-specific extra fields (e.g.
 *    `{ approvedAmount: "" }`, `{ documentsVerified: false }`).
 *  - renderExtraFields({ decision, fields, setFieldValue, errors }): render
 *    prop for stage-specific inputs, placed between the decision buttons
 *    and the remarks textarea.
 *  - extraValidate(decision, fields): optional, returns a field-keyed error
 *    map merged with `validateReviewDecision`'s own errors.
 *  - onSubmit(decision, remarks, fields): called only once validation
 *    passes and a decision is selected.
 *  - submitting, error: controlled by the caller (the network call lives
 *    one level up, in the stage panel).
 */
export default function ReviewPanelShell({
  claim,
  stage,
  decisionOptions = [],
  initialFields = {},
  renderExtraFields,
  extraValidate,
  onSubmit,
  submitting = false,
  error = null,
}) {
  const [decision, setDecision] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [fields, setFields] = useState(initialFields);

  const setFieldValue = (key, value) => setFields((prev) => ({ ...prev, [key]: value }));

  const claimedTotal = claim?.totalClaimedAmount ?? claim?.total_claimed_amount;
  const stageMeta = getReviewStageMeta(stage);
  const remarksRequired = Boolean(decision) && stageMeta?.cleanApproveDecision !== decision;

  const validation = useMemo(() => {
    const base = validateReviewDecision({
      stage,
      decision,
      remarks,
      approvedAmount: fields.approvedAmount,
      claimedTotal,
    });
    const extraErrors = decision && typeof extraValidate === "function" ? extraValidate(decision, fields) || {} : {};
    const errors = { ...base.errors, ...extraErrors };
    return { valid: Object.keys(errors).length === 0, errors };
  }, [stage, decision, remarks, fields, claimedTotal, extraValidate]);

  const canSubmit = Boolean(decision) && validation.valid && !submitting;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit?.(decision, remarks.trim(), fields);
  };

  return (
    <div className="space-y-4">
      <ClaimSummaryCard claim={claim} />

      <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-500 dark:text-gray-400">Decision</label>
          <div className="flex flex-wrap gap-2">
            {decisionOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={submitting}
                onClick={() => setDecision(option.value)}
                aria-pressed={decision === option.value}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  decision === option.value
                    ? "border-brand-600 bg-brand-600 text-white shadow-sm"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {typeof renderExtraFields === "function" &&
          renderExtraFields({ decision, fields, setFieldValue, errors: validation.errors })}

        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
            Remarks{remarksRequired && <span className="text-red-500"> *</span>}
          </label>
          <textarea
            rows={3}
            className={textareaClass}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder={remarksRequired ? "Required — explain the reason for this decision." : "Optional remarks"}
          />
          {validation.errors.remarks && <p className="mt-1 text-xs text-red-500">{validation.errors.remarks}</p>}
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? "Submitting…" : "Submit Decision"}
          </Button>
        </div>
      </div>
    </div>
  );
}
