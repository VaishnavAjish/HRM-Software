/**
 * The Section E expense categories — 6 rows, matching the paper claim
 * form's "DETAILS OF CLAIM AMOUNT" table exactly.
 */

export const EXPENSE_CATEGORY = {
  CONSULTATION_FEES: "CONSULTATION_FEES",
  HOSPITAL_CHARGES: "HOSPITAL_CHARGES",
  MEDICINES: "MEDICINES",
  DIAGNOSTIC_TESTS: "DIAGNOSTIC_TESTS",
  SURGERY_PROCEDURE: "SURGERY_PROCEDURE",
  OTHER_EXPENSES: "OTHER_EXPENSES",
};

export const EXPENSE_CATEGORIES = [
  { key: EXPENSE_CATEGORY.CONSULTATION_FEES, label: "Consultation Fees" },
  { key: EXPENSE_CATEGORY.HOSPITAL_CHARGES, label: "Hospital Charges" },
  { key: EXPENSE_CATEGORY.MEDICINES, label: "Medicines" },
  { key: EXPENSE_CATEGORY.DIAGNOSTIC_TESTS, label: "Diagnostic Tests" },
  { key: EXPENSE_CATEGORY.SURGERY_PROCEDURE, label: "Surgery / Procedure" },
  { key: EXPENSE_CATEGORY.OTHER_EXPENSES, label: "Other Expenses" },
];

export function getExpenseCategoryLabel(key) {
  return EXPENSE_CATEGORIES.find((category) => category.key === key)?.label || key;
}
