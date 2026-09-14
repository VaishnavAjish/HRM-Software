/**
 * The claim submission wizard's steps (F4 — SubmitClaimTab), covering the
 * paper claim form's 7 sections in 6 interactive steps. Section A (employee
 * details) is folded read-only into Step 1 alongside Section B, since
 * nothing in Section A is employee-editable — it is a snapshot of the
 * logged-in employee's own record.
 */

export const WIZARD_STEP = {
  PATIENT: "patient",
  MEDICAL_HISTORY: "medical-history",
  TREATMENT: "treatment",
  EXPENSES: "expenses",
  DOCUMENTS: "documents",
  DECLARATION: "declaration",
};

export const WIZARD_STEPS = [
  {
    key: WIZARD_STEP.PATIENT,
    order: 1,
    label: "Patient",
    sectionLabel: "Section A & B",
    description: "Employee details (read-only) and the covered family member this claim is for.",
  },
  {
    key: WIZARD_STEP.MEDICAL_HISTORY,
    order: 2,
    label: "Medical History",
    sectionLabel: "Section C",
    description: "Nature of illness, initial symptoms, first consultation, and medico-legal status.",
  },
  {
    key: WIZARD_STEP.TREATMENT,
    order: 3,
    label: "Treatment",
    sectionLabel: "Section D",
    description: "Hospital, type of treatment, admission/discharge, and treatment description.",
  },
  {
    key: WIZARD_STEP.EXPENSES,
    order: 4,
    label: "Expenses",
    sectionLabel: "Section E",
    description: "Claimed expenses by category. The office calculates and approves the final amount.",
  },
  {
    key: WIZARD_STEP.DOCUMENTS,
    order: 5,
    label: "Documents",
    sectionLabel: "Section F",
    description: "Supporting document checklist. Locked until the claim has been saved once.",
  },
  {
    key: WIZARD_STEP.DECLARATION,
    order: 6,
    label: "Declaration",
    sectionLabel: "Section G",
    description: "Trilingual declaration and acknowledgement, then submit.",
  },
];

export const DEFAULT_WIZARD_STEP = WIZARD_STEP.PATIENT;

const STEP_ORDER = WIZARD_STEPS.map((step) => step.key);

export function getWizardStepIndex(step) {
  return STEP_ORDER.indexOf(step);
}

export function isValidWizardStep(step) {
  return STEP_ORDER.includes(step);
}

export function getWizardStepMeta(step) {
  return WIZARD_STEPS.find((s) => s.key === step) || null;
}
