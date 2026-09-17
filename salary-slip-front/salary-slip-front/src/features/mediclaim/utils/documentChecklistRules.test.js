import { describe, expect, it } from "vitest";
import { REQUIREMENT, getRequiredDocumentTypes, resolveRequiredDocuments } from "./documentChecklistRules";

// Mirrors the seeded defaults in
// 2026_09_16_000003_create_mediclaim_document_requirements_table.php —
// these tests exercise the resolution logic against a realistic HR-managed
// list rather than a hardcoded constant.
const REQUIREMENTS_FIXTURE = [
  { documentType: "MEDICLAIM_CLAIM_FORM", isRequired: true, conditionalRule: null },
  { documentType: "PRESCRIPTION", isRequired: true, conditionalRule: null },
  { documentType: "MEDICAL_REPORT", isRequired: true, conditionalRule: null },
  { documentType: "HOSPITAL_BILL", isRequired: true, conditionalRule: null },
  { documentType: "MEDICINE_BILL", isRequired: true, conditionalRule: null },
  { documentType: "DISCHARGE_SUMMARY", isRequired: false, conditionalRule: "hospitalized_or_surgery" },
  { documentType: "FIR_MLC", isRequired: false, conditionalRule: "medico_legal" },
  { documentType: "OTHER", isRequired: false, conditionalRule: null },
];

const ALWAYS_REQUIRED = ["MEDICLAIM_CLAIM_FORM", "PRESCRIPTION", "MEDICAL_REPORT", "HOSPITAL_BILL", "MEDICINE_BILL"];

describe("resolveRequiredDocuments", () => {
  it.each(["opd", "emergency", "tests_only", "", undefined])(
    "marks Discharge Summary optional for a non-hospitalized treatment type (%s)",
    (treatmentType) => {
      const resolved = resolveRequiredDocuments(REQUIREMENTS_FIXTURE, { treatmentType, isMedicoLegal: false });
      expect(resolved.DISCHARGE_SUMMARY).toBe(REQUIREMENT.OPTIONAL);
    },
  );

  it.each(["hospitalization", "surgery"])(
    "marks Discharge Summary required for treatment type %s",
    (treatmentType) => {
      const resolved = resolveRequiredDocuments(REQUIREMENTS_FIXTURE, { treatmentType, isMedicoLegal: false });
      expect(resolved.DISCHARGE_SUMMARY).toBe(REQUIREMENT.REQUIRED);
    },
  );

  it.each(["HOSPITALIZATION", "Surgery"])(
    "does NOT match an uppercase/mixed-case treatment type (%s) — strict lowercase comparison",
    (treatmentType) => {
      const resolved = resolveRequiredDocuments(REQUIREMENTS_FIXTURE, { treatmentType, isMedicoLegal: false });
      expect(resolved.DISCHARGE_SUMMARY).toBe(REQUIREMENT.OPTIONAL);
    },
  );

  it("marks FIR / MLC required only when isMedicoLegal is true", () => {
    expect(resolveRequiredDocuments(REQUIREMENTS_FIXTURE, { isMedicoLegal: true }).FIR_MLC).toBe(REQUIREMENT.REQUIRED);
  });

  it.each([false, undefined, null])("marks FIR / MLC optional when isMedicoLegal is %s", (isMedicoLegal) => {
    expect(resolveRequiredDocuments(REQUIREMENTS_FIXTURE, { isMedicoLegal }).FIR_MLC).toBe(REQUIREMENT.OPTIONAL);
  });

  it("marks 'Any Other Supporting Documents' always optional, regardless of treatment type or medico-legal flag", () => {
    const combos = [
      { treatmentType: "hospitalization", isMedicoLegal: true },
      { treatmentType: "opd", isMedicoLegal: false },
      {},
    ];
    for (const combo of combos) {
      expect(resolveRequiredDocuments(REQUIREMENTS_FIXTURE, combo).OTHER).toBe(REQUIREMENT.OPTIONAL);
    }
  });

  it("requires every other document type by default, independent of treatment type / medico-legal", () => {
    const resolved = resolveRequiredDocuments(REQUIREMENTS_FIXTURE, {});
    for (const type of ALWAYS_REQUIRED) {
      expect(resolved[type]).toBe(REQUIREMENT.REQUIRED);
    }
  });

  it("requires every base document type even for a hospitalization + medico-legal claim", () => {
    const resolved = resolveRequiredDocuments(REQUIREMENTS_FIXTURE, { treatmentType: "surgery", isMedicoLegal: true });
    for (const type of ALWAYS_REQUIRED) {
      expect(resolved[type]).toBe(REQUIREMENT.REQUIRED);
    }
    expect(resolved.DISCHARGE_SUMMARY).toBe(REQUIREMENT.REQUIRED);
    expect(resolved.FIR_MLC).toBe(REQUIREMENT.REQUIRED);
  });

  it("handles a missing requirements list / snapshot gracefully", () => {
    expect(resolveRequiredDocuments()).toEqual({});

    const resolved = resolveRequiredDocuments(REQUIREMENTS_FIXTURE);
    expect(resolved.DISCHARGE_SUMMARY).toBe(REQUIREMENT.OPTIONAL);
    expect(resolved.FIR_MLC).toBe(REQUIREMENT.OPTIONAL);
    for (const type of ALWAYS_REQUIRED) {
      expect(resolved[type]).toBe(REQUIREMENT.REQUIRED);
    }
  });

  it("ignores a row an HR admin has retired (is_active is filtered upstream by the API, not here)", () => {
    // resolveRequiredDocuments trusts whatever list it's handed — the
    // active-only filtering happens server-side in
    // Admin\DocumentRequirementController::index() by default.
    const resolved = resolveRequiredDocuments([{ documentType: "OTHER", isRequired: true, conditionalRule: null }], {});
    expect(Object.keys(resolved)).toEqual(["OTHER"]);
  });
});

describe("getRequiredDocumentTypes", () => {
  it("returns exactly the 5 always-required types for a plain OPD, non-medico-legal claim", () => {
    const required = getRequiredDocumentTypes(REQUIREMENTS_FIXTURE, { treatmentType: "opd", isMedicoLegal: false });
    expect(required.sort()).toEqual([...ALWAYS_REQUIRED].sort());
  });

  it("adds Discharge Summary for a hospitalization claim", () => {
    const required = getRequiredDocumentTypes(REQUIREMENTS_FIXTURE, { treatmentType: "hospitalization", isMedicoLegal: false });
    expect(required).toContain("DISCHARGE_SUMMARY");
    expect(required).not.toContain("FIR_MLC");
  });

  it("adds FIR/MLC for a medico-legal claim", () => {
    const required = getRequiredDocumentTypes(REQUIREMENTS_FIXTURE, { treatmentType: "opd", isMedicoLegal: true });
    expect(required).toContain("FIR_MLC");
    expect(required).not.toContain("DISCHARGE_SUMMARY");
  });

  it("never includes 'Any Other Supporting Documents' in the required list", () => {
    const required = getRequiredDocumentTypes(REQUIREMENTS_FIXTURE, { treatmentType: "surgery", isMedicoLegal: true });
    expect(required).not.toContain("OTHER");
  });

  it("returns an empty list when no requirements have loaded yet", () => {
    expect(getRequiredDocumentTypes([], { treatmentType: "opd" })).toEqual([]);
  });
});
