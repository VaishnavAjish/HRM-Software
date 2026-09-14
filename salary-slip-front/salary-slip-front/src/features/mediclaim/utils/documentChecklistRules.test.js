import { describe, expect, it } from "vitest";
import { DOCUMENT_TYPE } from "../models/documentTypes";
import { REQUIREMENT, getRequiredDocumentTypes, resolveRequiredDocuments } from "./documentChecklistRules";

const ALWAYS_REQUIRED = [
  DOCUMENT_TYPE.CLAIM_FORM,
  DOCUMENT_TYPE.PRESCRIPTION,
  DOCUMENT_TYPE.MEDICAL_REPORT,
  DOCUMENT_TYPE.HOSPITAL_BILL,
  DOCUMENT_TYPE.MEDICINE_BILL,
];

describe("resolveRequiredDocuments", () => {
  it.each(["opd", "emergency", "tests_only", "", undefined])(
    "marks Discharge Summary optional for a non-hospitalized treatment type (%s)",
    (treatmentType) => {
      const resolved = resolveRequiredDocuments({ treatmentType, isMedicoLegal: false });
      expect(resolved[DOCUMENT_TYPE.DISCHARGE_SUMMARY]).toBe(REQUIREMENT.OPTIONAL);
    },
  );

  it.each(["hospitalization", "surgery"])(
    "marks Discharge Summary required for treatment type %s (lowercase, per the corrected enum)",
    (treatmentType) => {
      const resolved = resolveRequiredDocuments({ treatmentType, isMedicoLegal: false });
      expect(resolved[DOCUMENT_TYPE.DISCHARGE_SUMMARY]).toBe(REQUIREMENT.REQUIRED);
    },
  );

  it.each(["HOSPITALIZATION", "Surgery"])(
    "does NOT match an uppercase/mixed-case treatment type (%s) — the rule is a strict lowercase comparison",
    (treatmentType) => {
      const resolved = resolveRequiredDocuments({ treatmentType, isMedicoLegal: false });
      expect(resolved[DOCUMENT_TYPE.DISCHARGE_SUMMARY]).toBe(REQUIREMENT.OPTIONAL);
    },
  );

  it("marks FIR / MLC required only when isMedicoLegal is true", () => {
    expect(resolveRequiredDocuments({ isMedicoLegal: true })[DOCUMENT_TYPE.FIR_MLC]).toBe(REQUIREMENT.REQUIRED);
  });

  it.each([false, undefined, null])("marks FIR / MLC optional when isMedicoLegal is %s", (isMedicoLegal) => {
    expect(resolveRequiredDocuments({ isMedicoLegal })[DOCUMENT_TYPE.FIR_MLC]).toBe(REQUIREMENT.OPTIONAL);
  });

  it("marks 'Any Other Supporting Documents' always optional, regardless of treatment type or medico-legal flag", () => {
    const combos = [
      { treatmentType: "hospitalization", isMedicoLegal: true },
      { treatmentType: "opd", isMedicoLegal: false },
      {},
    ];
    for (const combo of combos) {
      expect(resolveRequiredDocuments(combo)[DOCUMENT_TYPE.OTHER_SUPPORTING]).toBe(REQUIREMENT.OPTIONAL);
    }
  });

  it("requires every other document type by default, independent of treatment type / medico-legal", () => {
    const resolved = resolveRequiredDocuments({});
    for (const type of ALWAYS_REQUIRED) {
      expect(resolved[type]).toBe(REQUIREMENT.REQUIRED);
    }
  });

  it("requires every base document type even for a hospitalization + medico-legal claim", () => {
    const resolved = resolveRequiredDocuments({ treatmentType: "surgery", isMedicoLegal: true });
    for (const type of ALWAYS_REQUIRED) {
      expect(resolved[type]).toBe(REQUIREMENT.REQUIRED);
    }
    expect(resolved[DOCUMENT_TYPE.DISCHARGE_SUMMARY]).toBe(REQUIREMENT.REQUIRED);
    expect(resolved[DOCUMENT_TYPE.FIR_MLC]).toBe(REQUIREMENT.REQUIRED);
  });

  it("handles a missing context object gracefully (no treatment type, no medico-legal flag)", () => {
    const resolved = resolveRequiredDocuments();
    expect(resolved[DOCUMENT_TYPE.DISCHARGE_SUMMARY]).toBe(REQUIREMENT.OPTIONAL);
    expect(resolved[DOCUMENT_TYPE.FIR_MLC]).toBe(REQUIREMENT.OPTIONAL);
    for (const type of ALWAYS_REQUIRED) {
      expect(resolved[type]).toBe(REQUIREMENT.REQUIRED);
    }
  });
});

describe("getRequiredDocumentTypes", () => {
  it("returns exactly the 5 always-required types for a plain OPD, non-medico-legal claim", () => {
    const required = getRequiredDocumentTypes({ treatmentType: "opd", isMedicoLegal: false });
    expect(required.sort()).toEqual([...ALWAYS_REQUIRED].sort());
  });

  it("adds Discharge Summary for a hospitalization claim", () => {
    const required = getRequiredDocumentTypes({ treatmentType: "hospitalization", isMedicoLegal: false });
    expect(required).toContain(DOCUMENT_TYPE.DISCHARGE_SUMMARY);
    expect(required).not.toContain(DOCUMENT_TYPE.FIR_MLC);
  });

  it("adds FIR/MLC for a medico-legal claim", () => {
    const required = getRequiredDocumentTypes({ treatmentType: "opd", isMedicoLegal: true });
    expect(required).toContain(DOCUMENT_TYPE.FIR_MLC);
    expect(required).not.toContain(DOCUMENT_TYPE.DISCHARGE_SUMMARY);
  });

  it("never includes 'Any Other Supporting Documents' in the required list", () => {
    const required = getRequiredDocumentTypes({ treatmentType: "surgery", isMedicoLegal: true });
    expect(required).not.toContain(DOCUMENT_TYPE.OTHER_SUPPORTING);
  });
});
