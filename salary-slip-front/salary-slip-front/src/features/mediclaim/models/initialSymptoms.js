/**
 * Section C's "Initial Symptoms (tick applicable)" checkboxes, matching the
 * paper claim form exactly. "Other" carries a free-text detail field on the
 * form (`Other __________`), so it is flagged `requiresDetail` here for the
 * medical-history step's validator to enforce.
 */

export const INITIAL_SYMPTOM = {
  FEVER: "FEVER",
  PAIN: "PAIN",
  INJURY_ACCIDENT: "INJURY_ACCIDENT",
  INFECTION: "INFECTION",
  BREATHING_PROBLEM: "BREATHING_PROBLEM",
  OTHER: "OTHER",
};

export const INITIAL_SYMPTOMS = [
  { key: INITIAL_SYMPTOM.FEVER, label: "Fever" },
  { key: INITIAL_SYMPTOM.PAIN, label: "Pain" },
  { key: INITIAL_SYMPTOM.INJURY_ACCIDENT, label: "Injury / Accident" },
  { key: INITIAL_SYMPTOM.INFECTION, label: "Infection" },
  { key: INITIAL_SYMPTOM.BREATHING_PROBLEM, label: "Breathing Problem" },
  { key: INITIAL_SYMPTOM.OTHER, label: "Other", requiresDetail: true },
];
