export const REQUIREMENT = {
  REQUIRED: "REQUIRED",
  OPTIONAL: "OPTIONAL",
};

const HOSPITALIZED_TREATMENT_TYPES = ["hospitalization", "surgery"];

function isTrueBoolean(val) {
  if (val === true || val === 1 || val === '1' || val === 'true' || val === 'Yes' || val === 'YES' || val === 'yes') {
    return true;
  }
  return false;
}

function requirementFor(row, { treatmentType, isMedicoLegal } = {}) {
  const rule = row.conditionalRule ?? row.conditional_rule ?? null;
  let required;

  if (rule === "hospitalized_or_surgery") {
    required = HOSPITALIZED_TREATMENT_TYPES.includes(treatmentType);
  } else if (rule === "medico_legal") {
    required = isTrueBoolean(isMedicoLegal);
  } else {
    required = Boolean(row.isRequired ?? row.is_required);
  }

  return required ? REQUIREMENT.REQUIRED : REQUIREMENT.OPTIONAL;
}

/**
 * Per-row required/optional state for the document checklist, driven by the
 * HR-managed `requirements` list (`mediclaimApi.documentRequirements()` —
 * `Admin\DocumentRequirementController`) instead of a hardcoded constant.
 * `conditionalRule` reproduces the two conditional rules the paper form
 * encodes ("(if hospitalized)" / "(if applicable)") as data HR can edit:
 *   - `hospitalized_or_surgery`: required iff treatment type is
 *     Hospitalization or Surgery.
 *   - `medico_legal`: required iff the case is medico-legal.
 * A row with no `conditionalRule` just uses its own `isRequired` flag
 * unconditionally.
 */
export function resolveRequiredDocuments(requirements = [], claimSnapshot = {}) {
  const result = {};

  (requirements || []).forEach((row) => {
    const type = row.documentType || row.document_type;
    if (!type) return;
    result[type] = requirementFor(row, claimSnapshot);
  });

  return result;
}

/** The subset of `resolveRequiredDocuments()` that are actually REQUIRED, as a flat list of document type codes — what upload-completeness checks compare against. */
export function getRequiredDocumentTypes(requirements = [], claimSnapshot = {}) {
  const resolved = resolveRequiredDocuments(requirements, claimSnapshot);
  return Object.entries(resolved)
    .filter(([, requirement]) => requirement === REQUIREMENT.REQUIRED)
    .map(([documentType]) => documentType);
}
