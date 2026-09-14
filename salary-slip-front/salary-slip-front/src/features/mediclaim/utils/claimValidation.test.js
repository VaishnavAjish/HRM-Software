import { describe, expect, it } from "vitest";
import { REVIEW_STAGE } from "../models/reviewStages";
import {
  validateDeclarationStep,
  validateDocumentsStep,
  validateExpensesStep,
  validatePatientStep,
  validateReviewDecision,
  validateTreatmentStep,
} from "./claimValidation";

describe("validateReviewDecision", () => {
  it("rejects when no decision is selected, without evaluating remarks", () => {
    const result = validateReviewDecision({ stage: REVIEW_STAGE.MANAGER, decision: "", remarks: "" });
    expect(result.valid).toBe(false);
    expect(result.errors.decision).toBe("Select a decision.");
    expect(result.errors.remarks).toBeUndefined();
  });

  describe("remarks required unless a clean approve", () => {
    it.each([
      [REVIEW_STAGE.MANAGER, "APPROVE"],
      [REVIEW_STAGE.COORDINATOR, "VERIFIED"],
      [REVIEW_STAGE.COMMITTEE, "RECOMMENDED"],
      [REVIEW_STAGE.HR_ELIGIBILITY, "VERIFIED"],
      [REVIEW_STAGE.DIRECTOR, "APPROVED"],
    ])("a clean %s / %s decision needs no remarks", (stage, decision) => {
      const result = validateReviewDecision({
        stage, decision, remarks: "", approvedAmount: stage === REVIEW_STAGE.DIRECTOR ? 100 : undefined,
      });
      expect(result.errors.remarks).toBeUndefined();
    });

    it.each([
      [REVIEW_STAGE.MANAGER, "REJECT"],
      [REVIEW_STAGE.MANAGER, "RETURN"],
      [REVIEW_STAGE.COORDINATOR, "RETURN"],
      [REVIEW_STAGE.COMMITTEE, "NOT_RECOMMENDED"],
      [REVIEW_STAGE.HR_ELIGIBILITY, "RETURN"],
      [REVIEW_STAGE.DIRECTOR, "REJECTED"],
      [REVIEW_STAGE.DIRECTOR, "PARTIALLY_APPROVED"],
    ])("%s / %s requires remarks", (stage, decision) => {
      const result = validateReviewDecision({ stage, decision, remarks: "" });
      expect(result.valid).toBe(false);
      expect(result.errors.remarks).toBe("Remarks are required for this decision.");
    });

    it("rejects remarks shorter than the 5-character minimum", () => {
      const result = validateReviewDecision({ stage: REVIEW_STAGE.MANAGER, decision: "REJECT", remarks: "no" });
      expect(result.valid).toBe(false);
      expect(result.errors.remarks).toMatch(/at least 5 characters/);
    });

    it("accepts remarks that are only whitespace-padded but long enough once trimmed", () => {
      const result = validateReviewDecision({ stage: REVIEW_STAGE.MANAGER, decision: "REJECT", remarks: "  valid reason  " });
      expect(result.errors.remarks).toBeUndefined();
    });

    it("treats whitespace-only remarks as empty, not as satisfying the requirement", () => {
      const result = validateReviewDecision({ stage: REVIEW_STAGE.MANAGER, decision: "REJECT", remarks: "     " });
      expect(result.errors.remarks).toBe("Remarks are required for this decision.");
    });

    it("is case-insensitive when matching the clean-approve decision set", () => {
      const result = validateReviewDecision({ stage: REVIEW_STAGE.MANAGER, decision: "approve", remarks: "" });
      expect(result.errors.remarks).toBeUndefined();
    });
  });

  describe("Director's approved-amount rule", () => {
    it("requires an approved amount for a clean Approved decision", () => {
      const result = validateReviewDecision({ stage: REVIEW_STAGE.DIRECTOR, decision: "APPROVED", remarks: "" });
      expect(result.valid).toBe(false);
      expect(result.errors.approvedAmount).toBe("Approved amount is required unless the claim is rejected.");
    });

    it("requires an approved amount for Partially Approved too (not a clean approve)", () => {
      const result = validateReviewDecision({
        stage: REVIEW_STAGE.DIRECTOR, decision: "PARTIALLY_APPROVED", remarks: "reduced due to policy cap",
      });
      expect(result.valid).toBe(false);
      expect(result.errors.approvedAmount).toBe("Approved amount is required unless the claim is rejected.");
    });

    it("does NOT require an approved amount when the decision is Rejected", () => {
      const result = validateReviewDecision({
        stage: REVIEW_STAGE.DIRECTOR, decision: "REJECTED", remarks: "does not meet policy criteria",
      });
      expect(result.valid).toBe(true);
      expect(result.errors.approvedAmount).toBeUndefined();
    });

    it("rejects a negative approved amount", () => {
      const result = validateReviewDecision({ stage: REVIEW_STAGE.DIRECTOR, decision: "APPROVED", approvedAmount: -5 });
      expect(result.errors.approvedAmount).toBe("Approved amount must be a positive number.");
    });

    it("rejects a non-numeric approved amount", () => {
      const result = validateReviewDecision({ stage: REVIEW_STAGE.DIRECTOR, decision: "APPROVED", approvedAmount: "abc" });
      expect(result.errors.approvedAmount).toBe("Approved amount must be a positive number.");
    });

    it("rejects an approved amount greater than the claimed total", () => {
      const result = validateReviewDecision({
        stage: REVIEW_STAGE.DIRECTOR, decision: "APPROVED", approvedAmount: 15000, claimedTotal: 10000,
      });
      expect(result.errors.approvedAmount).toBe("Approved amount cannot exceed the total claimed amount.");
    });

    it("accepts a valid approved amount within the claimed total", () => {
      const result = validateReviewDecision({
        stage: REVIEW_STAGE.DIRECTOR, decision: "APPROVED", approvedAmount: 8000, claimedTotal: 10000,
      });
      expect(result.valid).toBe(true);
    });

    it("accepts an approved amount exactly equal to the claimed total", () => {
      const result = validateReviewDecision({
        stage: REVIEW_STAGE.DIRECTOR, decision: "APPROVED", approvedAmount: 10000, claimedTotal: 10000,
      });
      expect(result.valid).toBe(true);
    });

    it("never applies the approved-amount rule to non-Director stages", () => {
      const result = validateReviewDecision({ stage: REVIEW_STAGE.MANAGER, decision: "APPROVE", approvedAmount: undefined });
      expect(result.valid).toBe(true);
      expect(result.errors.approvedAmount).toBeUndefined();
    });
  });
});

describe("validatePatientStep (Step 1 — Section B)", () => {
  it("requires a selected member", () => {
    const result = validatePatientStep({});
    expect(result.valid).toBe(false);
    expect(result.errors.memberId).toBeTruthy();
    expect(result.errors.relationshipType).toBeTruthy();
  });

  it("passes once memberId and relationshipType are set", () => {
    const result = validatePatientStep({ memberId: "12", relationshipType: "SELF" });
    expect(result).toEqual({ valid: true, errors: {} });
  });
});

describe("validateTreatmentStep (Step 3 — Section D)", () => {
  const baseValid = {
    hospitalId: "3",
    treatmentType: "opd",
    treatmentDescription: "Routine consultation",
    isOngoing: false,
  };

  it("requires a network hospital selection when not marked non-network", () => {
    const result = validateTreatmentStep({ ...baseValid, hospitalId: "" });
    expect(result.valid).toBe(false);
    expect(result.errors.hospitalId).toBeTruthy();
  });

  it("requires hospital name and reason when marked non-network, instead of hospitalId", () => {
    const result = validateTreatmentStep({
      ...baseValid, hospitalId: "", isNonNetworkHospital: true, nonNetworkHospitalName: "", nonNetworkReason: "",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.nonNetworkHospitalName).toBeTruthy();
    expect(result.errors.nonNetworkReason).toBeTruthy();
    expect(result.errors.hospitalId).toBeUndefined();
  });

  it("does not require admission/discharge dates for OPD", () => {
    const result = validateTreatmentStep(baseValid);
    expect(result.valid).toBe(true);
  });

  it.each(["hospitalization", "surgery", "emergency"])(
    "requires an admission date for %s",
    (treatmentType) => {
      const result = validateTreatmentStep({ ...baseValid, treatmentType, admissionDate: "" });
      expect(result.valid).toBe(false);
      expect(result.errors.admissionDate).toBeTruthy();
    },
  );

  it("requires a discharge date for hospitalization unless ongoing", () => {
    const missing = validateTreatmentStep({
      ...baseValid, treatmentType: "hospitalization", admissionDate: "2026-01-01T10:00", isOngoing: false, dischargeDate: "",
    });
    expect(missing.errors.dischargeDate).toBeTruthy();

    const ongoing = validateTreatmentStep({
      ...baseValid, treatmentType: "hospitalization", admissionDate: "2026-01-01T10:00", isOngoing: true, dischargeDate: "",
    });
    expect(ongoing.errors.dischargeDate).toBeUndefined();
  });

  it("requires an isOngoing decision (true/false, not left undefined)", () => {
    const result = validateTreatmentStep({ ...baseValid, isOngoing: undefined });
    expect(result.errors.isOngoing).toBeTruthy();
  });

  it("requires a treatment description", () => {
    const result = validateTreatmentStep({ ...baseValid, treatmentDescription: "" });
    expect(result.errors.treatmentDescription).toBeTruthy();
  });
});

describe("validateExpensesStep (Step 4 — Section E)", () => {
  it("requires at least one line item", () => {
    expect(validateExpensesStep({ expenseLines: [] }).valid).toBe(false);
  });

  it("requires at least one line with a positive amount", () => {
    const result = validateExpensesStep({ expenseLines: [{ category: "MEDICINES", amount: "0" }] });
    expect(result.valid).toBe(false);
  });

  it("passes once at least one line has a positive amount", () => {
    const result = validateExpensesStep({ expenseLines: [{ category: "MEDICINES", amount: "0" }, { category: "OTHER_EXPENSES", amount: "50" }] });
    expect(result.valid).toBe(true);
  });
});

describe("validateDocumentsStep (Step 5 — Section F)", () => {
  it("reports every required-but-missing document type", () => {
    const result = validateDocumentsStep({ uploadedDocumentTypes: ["PRESCRIPTION"] }, ["PRESCRIPTION", "HOSPITAL_BILL", "MEDICINE_BILL"]);
    expect(result.valid).toBe(false);
    expect(result.errors.documents).toContain("HOSPITAL_BILL");
    expect(result.errors.documents).toContain("MEDICINE_BILL");
    expect(result.errors.documents).not.toContain("PRESCRIPTION");
  });

  it("passes once every required document type has been uploaded", () => {
    const result = validateDocumentsStep(
      { uploadedDocumentTypes: ["PRESCRIPTION", "HOSPITAL_BILL"] },
      ["PRESCRIPTION", "HOSPITAL_BILL"],
    );
    expect(result.valid).toBe(true);
  });

  it("passes trivially when nothing is required", () => {
    expect(validateDocumentsStep({ uploadedDocumentTypes: [] }, []).valid).toBe(true);
  });
});

describe("validateDeclarationStep (Step 6 — Section G)", () => {
  it("requires the acceptance checkbox", () => {
    const result = validateDeclarationStep({ declarationAccepted: false, declarationVersion: "v1" });
    expect(result.valid).toBe(false);
    expect(result.errors.declarationAccepted).toBeTruthy();
  });

  it("requires a recorded declaration version even if accepted is true", () => {
    const result = validateDeclarationStep({ declarationAccepted: true, declarationVersion: "" });
    expect(result.valid).toBe(false);
    expect(result.errors.declarationVersion).toBeTruthy();
  });

  it("passes once accepted and a version are both present", () => {
    const result = validateDeclarationStep({ declarationAccepted: true, declarationVersion: "v1" });
    expect(result.valid).toBe(true);
  });
});
