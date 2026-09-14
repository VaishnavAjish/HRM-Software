/**
 * The Section F document checklist — a fixed 8 rows, matching the paper
 * claim form exactly ("DOCUMENTS SUBMITTED (TICK ✓)").
 *
 * `documentType` is the catalogue code the claim document upload/list
 * endpoints use (see the backend plan's B2 section:
 * `DocumentType::CATEGORIES['Medical']` gains `MEDICLAIM_CLAIM_FORM`,
 * `HOSPITAL_BILL`, `DISCHARGE_SUMMARY`, `PRESCRIPTION`, `MEDICAL_REPORT`,
 * `MEDICINE_BILL`, `FIR_MLC`). "Any Other Supporting Documents" reuses the
 * catalogue's existing generic `OTHER` fallback code rather than a new
 * Mediclaim-specific one, since B2 does not define one for it.
 */

export const DOCUMENT_TYPE = {
  CLAIM_FORM: "MEDICLAIM_CLAIM_FORM",
  PRESCRIPTION: "PRESCRIPTION",
  MEDICAL_REPORT: "MEDICAL_REPORT",
  HOSPITAL_BILL: "HOSPITAL_BILL",
  MEDICINE_BILL: "MEDICINE_BILL",
  DISCHARGE_SUMMARY: "DISCHARGE_SUMMARY",
  FIR_MLC: "FIR_MLC",
  OTHER_SUPPORTING: "OTHER",
};

export const CLAIM_DOCUMENT_CHECKLIST = [
  {
    key: "claimForm",
    documentType: DOCUMENT_TYPE.CLAIM_FORM,
    label: "Duly Filled Claim Form",
  },
  {
    key: "doctorPrescription",
    documentType: DOCUMENT_TYPE.PRESCRIPTION,
    label: "Doctor Prescription",
  },
  {
    key: "medicalReports",
    documentType: DOCUMENT_TYPE.MEDICAL_REPORT,
    label: "Medical Reports",
  },
  {
    key: "hospitalBill",
    documentType: DOCUMENT_TYPE.HOSPITAL_BILL,
    label: "Hospital Main Bill & Break-up",
  },
  {
    key: "medicineBills",
    documentType: DOCUMENT_TYPE.MEDICINE_BILL,
    label: "Medicine Bills",
  },
  {
    key: "dischargeSummary",
    documentType: DOCUMENT_TYPE.DISCHARGE_SUMMARY,
    label: "Discharge Summary",
    conditionNote: "Required if hospitalized",
  },
  {
    key: "firMlc",
    documentType: DOCUMENT_TYPE.FIR_MLC,
    label: "FIR / MLC",
    conditionNote: "Required if medico-legal",
  },
  {
    key: "otherSupporting",
    documentType: DOCUMENT_TYPE.OTHER_SUPPORTING,
    label: "Any Other Supporting Documents",
    conditionNote: "Optional",
  },
];

export function getChecklistRowByDocumentType(documentType) {
  return CLAIM_DOCUMENT_CHECKLIST.find((row) => row.documentType === documentType) || null;
}
