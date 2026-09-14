import { DOCUMENT_TYPE } from "../models/documentTypes";

export const REQUIREMENT = {
  REQUIRED: "REQUIRED",
  OPTIONAL: "OPTIONAL",
  // Reserved for a future rule that removes a row from the checklist
  // entirely. Not produced today: DocumentChecklist (F4) renders a *fixed*
  // 8-row checklist, so a row that isn't required for this claim still
  // shows as optional rather than disappearing.
  HIDDEN: "HIDDEN",
};

const HOSPITALIZED_TREATMENT_TYPES = ["hospitalization", "surgery"];

/**
 * Per-row required/optional state for the Section F document checklist,
 * driven only by treatment type and the medico-legal flag — exactly the two
 * conditional rules the paper form encodes ("(if hospitalized)" / "(if
 * applicable)"):
 *   - Discharge Summary: required iff treatment type is Hospitalization or Surgery
 *   - FIR / MLC: required iff the case is medico-legal
 * Every other row is required except "Any Other Supporting Documents", which
 * is always optional.
 */
export function resolveRequiredDocuments({ treatmentType, isMedicoLegal } = {}) {
  const isHospitalized = HOSPITALIZED_TREATMENT_TYPES.includes(treatmentType);

  return {
    [DOCUMENT_TYPE.CLAIM_FORM]: REQUIREMENT.REQUIRED,
    [DOCUMENT_TYPE.PRESCRIPTION]: REQUIREMENT.REQUIRED,
    [DOCUMENT_TYPE.MEDICAL_REPORT]: REQUIREMENT.REQUIRED,
    [DOCUMENT_TYPE.HOSPITAL_BILL]: REQUIREMENT.REQUIRED,
    [DOCUMENT_TYPE.MEDICINE_BILL]: REQUIREMENT.REQUIRED,
    [DOCUMENT_TYPE.DISCHARGE_SUMMARY]: isHospitalized ? REQUIREMENT.REQUIRED : REQUIREMENT.OPTIONAL,
    [DOCUMENT_TYPE.FIR_MLC]: isMedicoLegal ? REQUIREMENT.REQUIRED : REQUIREMENT.OPTIONAL,
    [DOCUMENT_TYPE.OTHER_SUPPORTING]: REQUIREMENT.OPTIONAL,
  };
}

/** The subset of `resolveRequiredDocuments()` that are actually REQUIRED, as a flat list of document type codes — what `validateDocumentsStep` checks uploads against. */
export function getRequiredDocumentTypes(context) {
  const resolved = resolveRequiredDocuments(context);
  return Object.entries(resolved)
    .filter(([, requirement]) => requirement === REQUIREMENT.REQUIRED)
    .map(([documentType]) => documentType);
}
