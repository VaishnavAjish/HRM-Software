import { INITIAL_SYMPTOM } from "../models/initialSymptoms";
import { REVIEW_STAGE } from "../models/reviewStages";

/**
 * Per-section validators for the "New Claim Request" popup
 * (`NewClaimRequestModal.jsx`, one flat form — no step wizard), and a
 * shared validator for stage review decisions (F5 — review panels).
 *
 * Every validator returns `{ valid, errors }` where `errors` is a
 * field-keyed map of human-readable messages, so a form component can spread
 * it directly onto its fields. These are UX-layer checks only — the
 * backend re-validates and is authoritative (see the workflow plan's
 * `ClaimWorkflowService`), so a validator here being slightly more lenient
 * than the server is safe; being stricter than the server is not, and was
 * avoided by keeping every rule traceable to a concrete field on the paper
 * claim form.
 *
 * The field lists here are reasonable given the plan's field inventory
 * (Sections A-G of the paper form).
 */

function ok() {
  return { valid: true, errors: {} };
}

function fail(errors) {
  return { valid: false, errors };
}

function fromErrors(errors) {
  return Object.keys(errors).length ? fail(errors) : ok();
}

/** Step 1 — Section A (read-only snapshot) & Section B (patient/member). */
export function validatePatientStep(data = {}) {
  const errors = {};

  if (!data.memberId) {
    errors.memberId = "Select the covered family member (or self) this claim is for.";
  }
  if (!data.relationshipType) {
    errors.relationshipType = "Relationship with employee is required.";
  }

  return fromErrors(errors);
}

/** Step 2 — Section C: medical history & diagnosis. */
export function validateMedicalHistoryStep(data = {}) {
  const errors = {};

  if (!data.natureOfIllness?.trim()) {
    errors.natureOfIllness = "Nature of illness / disease diagnosed is required.";
  }
  if (!data.symptomsFirstNoticedOn) {
    errors.symptomsFirstNoticedOn = "Date symptoms were first noticed is required.";
  }

  const symptoms = Array.isArray(data.initialSymptoms) ? data.initialSymptoms : [];
  if (symptoms.length === 0) {
    errors.initialSymptoms = "Select at least one initial symptom.";
  } else if (symptoms.includes(INITIAL_SYMPTOM.OTHER) && !data.initialSymptomOtherDetail?.trim()) {
    errors.initialSymptomOtherDetail = "Describe the other symptom.";
  }

  if (!data.firstConsultationDate) {
    errors.firstConsultationDate = "Date of first medical consultation is required.";
  }
  if (!data.treatingDoctorOrHospital?.trim()) {
    errors.treatingDoctorOrHospital = "Name of treating doctor / hospital / clinic is required.";
  }
  if (typeof data.isMedicoLegal !== "boolean") {
    errors.isMedicoLegal = "Indicate whether the case is medico-legal.";
  } else if (data.isMedicoLegal && typeof data.reportedToPolice !== "boolean") {
    errors.reportedToPolice = "Indicate whether the case was reported to the police.";
  }

  return fromErrors(errors);
}

const TREATMENT_TYPES_REQUIRING_ADMISSION = ["hospitalization", "surgery", "emergency"];

/** Step 3 — Section D: hospitalisation / treatment. */
export function validateTreatmentStep(data = {}) {
  const errors = {};

  if (data.isNonNetworkHospital) {
    if (!data.nonNetworkHospitalName?.trim()) {
      errors.nonNetworkHospitalName = "Hospital name is required.";
    }
    if (!data.nonNetworkReason?.trim()) {
      errors.nonNetworkReason = "Explain why a non-network hospital was used.";
    }
  } else if (!data.hospitalId) {
    errors.hospitalId = "Select the hospital where treatment was received.";
  }

  if (!data.treatmentType) {
    errors.treatmentType = "Type of treatment is required.";
  } else if (TREATMENT_TYPES_REQUIRING_ADMISSION.includes(data.treatmentType)) {
    if (!data.admissionDate) {
      errors.admissionDate = "Date of admission is required for this treatment type.";
    }
    if (!data.isOngoing && !data.dischargeDate) {
      errors.dischargeDate = "Date of discharge is required unless treatment is ongoing.";
    } else if (data.admissionDate && data.dischargeDate) {
      const admit = new Date(data.admissionDate);
      const discharge = new Date(data.dischargeDate);
      const admitDay = new Date(admit.getFullYear(), admit.getMonth(), admit.getDate());
      const dischargeDay = new Date(discharge.getFullYear(), discharge.getMonth(), discharge.getDate());
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      if (dischargeDay < admitDay) {
        errors.dischargeDate = "Discharge date cannot be before the admission date.";
      } else if (dischargeDay > today) {
        errors.dischargeDate = "Discharge date cannot be in the future.";
      }
    }
  }

  if (!data.treatmentDescription?.trim()) {
    errors.treatmentDescription = "Brief description of treatment / procedure is required.";
  }
  if (typeof data.isOngoing !== "boolean") {
    errors.isOngoing = "Indicate whether treatment is ongoing.";
  }

  return fromErrors(errors);
}

/** Step 4 — Section E: claim amount / expense lines. */
export function validateExpensesStep(data = {}) {
  const errors = {};
  const lines = Array.isArray(data.expenseLines) ? data.expenseLines : [];

  if (lines.length === 0) {
    errors.expenseLines = "Add at least one expense line item.";
  } else if (!lines.some((line) => Number(line?.amount) > 0)) {
    errors.expenseLines = "At least one expense line must have an amount greater than zero.";
  }

  return fromErrors(errors);
}

/**
 * Step 5 — Section F: document checklist. `requiredDocumentTypes` is
 * produced by `documentChecklistRules.getRequiredDocumentTypes()` for the
 * claim's current treatment type / medico-legal flag.
 */
export function validateDocumentsStep(data = {}, requiredDocumentTypes = []) {
  const errors = {};
  const uploaded = new Set(data.uploadedDocumentTypes || []);
  const missing = requiredDocumentTypes.filter((documentType) => !uploaded.has(documentType));

  if (missing.length > 0) {
    errors.documents = `Missing required document(s): ${missing.join(", ")}`;
  }

  return fromErrors(errors);
}

/** Step 6 — Section G: declaration & acknowledgement. */
export function validateDeclarationStep(data = {}) {
  const errors = {};

  if (!data.declarationAccepted) {
    errors.declarationAccepted = "You must accept the declaration before submitting.";
  }
  if (!data.declarationVersion) {
    errors.declarationVersion = "Declaration version is missing.";
  }

  return fromErrors(errors);
}

const MIN_REMARKS_LENGTH = 5;

// Decisions that are a clean, unconditional approval at their stage and so
// do not require remarks. Every other decision (rejections, returns, "not
// recommended", partial approval) must carry a reason the next reader —
// the employee on a return, an auditor on a rejection — can actually act on.
const CLEAN_APPROVE_DECISIONS = new Set(["APPROVE", "APPROVED", "VERIFIED", "RECOMMENDED"]);

/**
 * Shared validator for every stage review panel (F5): Manager, Coordinator,
 * Committee, HR Eligibility, Director. `stage` is one of `REVIEW_STAGE`.
 */
export function validateReviewDecision({ stage, decision, remarks, approvedAmount, claimedTotal } = {}) {
  const errors = {};

  if (!decision) {
    errors.decision = "Select a decision.";
    return fail(errors);
  }

  const normalizedDecision = String(decision).toUpperCase();
  const isCleanApprove = CLEAN_APPROVE_DECISIONS.has(normalizedDecision);
  const trimmedRemarks = remarks?.trim() || "";

  if (!isCleanApprove) {
    if (!trimmedRemarks) {
      errors.remarks = "Remarks are required for this decision.";
    } else if (trimmedRemarks.length < MIN_REMARKS_LENGTH) {
      errors.remarks = `Remarks must be at least ${MIN_REMARKS_LENGTH} characters.`;
    }
  }

  if ((stage === REVIEW_STAGE.DIRECTOR || stage === REVIEW_STAGE.APPROVAL) && normalizedDecision !== "REJECTED") {
    if (approvedAmount === undefined || approvedAmount === null || approvedAmount === "") {
      errors.approvedAmount = "Approved amount is required unless the claim is rejected.";
    } else if (Number.isNaN(Number(approvedAmount)) || Number(approvedAmount) < 0) {
      errors.approvedAmount = "Approved amount must be a positive number.";
    } else if (claimedTotal !== undefined && claimedTotal !== null && Number(approvedAmount) > Number(claimedTotal)) {
      errors.approvedAmount = "Approved amount cannot exceed the total claimed amount.";
    }
  }

  return fromErrors(errors);
}
