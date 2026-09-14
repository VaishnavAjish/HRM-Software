import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      accessToken: "test-token", tokenType: "Bearer",
      name: "Test Employee", empCode: "EMP-1",
    },
  }),
}));

const mediclaimApiMock = vi.hoisted(() => ({
  createClaim: vi.fn(),
  updateClaim: vi.fn(),
  getClaim: vi.fn(),
  submitClaim: vi.fn(),
  claimDocuments: vi.fn(),
  uploadClaimDocument: vi.fn(),
}));
vi.mock("../../../services/mediclaimApi", () => ({ mediclaimApi: mediclaimApiMock }));

import SubmitClaimTab from "./SubmitClaimTab";

const members = [
  { id: 1, name: "Test Employee", relationshipType: "SELF", dateOfBirth: "1990-01-01", gender: "Male" },
];
const lookups = { members, hospitals: [], loading: false, error: null };

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

function setup(initial = "/employee/tds/mediclaim?tab=submit") {
  const router = createMemoryRouter([{
    path: "/employee/tds/mediclaim",
    element: <><SubmitClaimTab lookups={lookups} /><LocationProbe /></>,
  }], { initialEntries: [initial] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  Object.values(mediclaimApiMock).forEach((fn) => fn.mockReset());
  mediclaimApiMock.claimDocuments.mockResolvedValue({ data: { data: [] } });
});

describe("useClaimWizard step-gating — Documents/Declaration require a real claim id", () => {
  it("refuses to open the Documents step with a hand-edited/stale URL that has no claimId, and falls back to Patient", async () => {
    setup("/employee/tds/mediclaim?tab=submit&wizardStep=documents");

    // The claim-id-gated step never renders — Step 1 (Patient/Section B) does instead.
    expect(screen.getByText(/Family Member \(Patient\)/)).toBeInTheDocument();
    expect(screen.queryByText("Duly Filled Claim Form")).not.toBeInTheDocument();

    // The guard corrects the URL itself rather than leaving it lying about the visible step.
    await waitFor(() => expect(screen.getByTestId("location")).not.toHaveTextContent("wizardStep=documents"));
  });

  it("refuses to open the Declaration step with no claimId either", async () => {
    setup("/employee/tds/mediclaim?tab=submit&wizardStep=declaration");

    expect(screen.getByText(/Family Member \(Patient\)/)).toBeInTheDocument();
    expect(screen.queryByText("Review Summary")).not.toBeInTheDocument();
  });

  it("does not call getClaim at all when there is no claimId in the URL", () => {
    setup("/employee/tds/mediclaim?tab=submit");
    expect(mediclaimApiMock.getClaim).not.toHaveBeenCalled();
  });
});

describe("?claimId=&wizardStep= URL round-trip", () => {
  it("resumes at the requested step and fetches the claim by id when both params are present", async () => {
    mediclaimApiMock.getClaim.mockResolvedValue({
      data: { id: 123, claimNumber: "MC-2026-000123", status: "DRAFT" },
    });

    setup("/employee/tds/mediclaim?tab=submit&claimId=123&wizardStep=documents");

    expect(screen.getByText("Loading claim…")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("Duly Filled Claim Form")).toBeInTheDocument());
    expect(screen.queryByText(/Family Member \(Patient\)/)).not.toBeInTheDocument();

    expect(mediclaimApiMock.getClaim).toHaveBeenCalledWith("123", "test-token", "Bearer");
    expect(mediclaimApiMock.claimDocuments).toHaveBeenCalledWith("123", "test-token", "Bearer");
  });

  it("shows a real error and an escape hatch when the claim id in the URL cannot be loaded", async () => {
    mediclaimApiMock.getClaim.mockRejectedValue(new Error("This claim could not be loaded."));

    setup("/employee/tds/mediclaim?tab=submit&claimId=999&wizardStep=patient");

    await waitFor(() => expect(screen.getByText("This claim could not be loaded.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Start a New Claim" })).toBeInTheDocument();
  });
});

describe("per-step validation gating — Patient step (Step 1)", () => {
  it("blocks Save & Continue until a family member is selected, and never creates a claim for an invalid step", async () => {
    const user = userEvent.setup();
    setup("/employee/tds/mediclaim?tab=submit");

    await user.click(screen.getByRole("button", { name: "Save & Continue" }));

    expect(screen.getByText(/Select the covered family member/)).toBeInTheDocument();
    expect(mediclaimApiMock.createClaim).not.toHaveBeenCalled();
    // Still on Patient — Medical History's own required field never appears.
    expect(screen.queryByText(/Nature of Illness/)).not.toBeInTheDocument();
  });

  it("saves the draft and advances to Medical History once a member is selected", async () => {
    mediclaimApiMock.createClaim.mockResolvedValue({ data: { id: 55, claimNumber: "MC-2026-000055", status: "DRAFT" } });
    const user = userEvent.setup();
    setup("/employee/tds/mediclaim?tab=submit");

    await user.selectOptions(screen.getByRole("combobox"), "1");
    await user.click(screen.getByRole("button", { name: "Save & Continue" }));

    await waitFor(() => expect(mediclaimApiMock.createClaim).toHaveBeenCalledTimes(1));
    const [payload] = mediclaimApiMock.createClaim.mock.calls[0];
    expect(payload.memberId).toBe("1");
    expect(payload.relationshipType).toBe("SELF");

    await waitFor(() => expect(screen.getByText(/Nature of Illness/)).toBeInTheDocument());
  });

  // Per the plan's own spec for F4 ("claimId+step mirrored into the tab's
  // ?claimId=&wizardStep= URL params for refresh-safe resume"), the id a
  // freshly-created claim gets back from the server should still be in the
  // URL once the wizard has advanced past Step 1. Tracing useClaimWizard.js
  // (goToStep at line 94-98, saveStep at line 105-125) suggests this may NOT
  // hold: SubmitClaimTab.jsx's handleSaveAndContinue calls
  // `await wizard.saveStep(formData)` then `wizard.goToStep(nextStep)` using
  // the SAME `wizard` object from the SAME render — so `goToStep`'s own
  // `routeClaimId` closure is still the PRE-save value (null, since no claim
  // existed yet at click time). `goToStep` writes
  // `{claimId: routeClaimId, step: nextStep}` verbatim, i.e. `{claimId: null,
  // ...}`, and `writeClaimWizardRouteState` treats a falsy claimId as
  // "delete the param" — so this call would erase the claimId `saveStep`
  // had just written moments earlier, rather than preserving it. This
  // assertion encodes the CORRECT/spec behavior per the task's instruction
  // to assert intended behavior and flag (not silently work around) a
  // suspected bug — see the phase's final report for the full trace; this
  // specific file could not be executed in this session (see report), so
  // this expected failure has not been empirically confirmed.
  it("keeps the newly-created claim id in the URL once the wizard advances past Step 1 (see comment above — suspected real bug, unconfirmed by execution)", async () => {
    mediclaimApiMock.createClaim.mockResolvedValue({ data: { id: 55, claimNumber: "MC-2026-000055", status: "DRAFT" } });
    const user = userEvent.setup();
    setup("/employee/tds/mediclaim?tab=submit");

    await user.selectOptions(screen.getByRole("combobox"), "1");
    await user.click(screen.getByRole("button", { name: "Save & Continue" }));

    await waitFor(() => expect(screen.getByText(/Nature of Illness/)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("claimId=55"));
  });
});

describe("per-step validation gating — Documents step (Step 5)", () => {
  function setupAtDocuments(uploadedDocs = []) {
    mediclaimApiMock.getClaim.mockResolvedValue({
      data: { id: 123, claimNumber: "MC-2026-000123", status: "DRAFT" },
    });
    mediclaimApiMock.claimDocuments.mockResolvedValue({ data: { data: uploadedDocs } });
    return setup("/employee/tds/mediclaim?tab=submit&claimId=123&wizardStep=documents");
  }

  it("blocks Save & Continue when required documents are missing, and does not advance to Declaration", async () => {
    const user = userEvent.setup();
    setupAtDocuments([]);
    await waitFor(() => expect(screen.getByText("Duly Filled Claim Form")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Save & Continue" }));

    expect(await screen.findByText(/Missing required document\(s\)/)).toBeInTheDocument();
    expect(screen.queryByText("Review Summary")).not.toBeInTheDocument();
    // This step never calls saveStep/updateClaim — uploads persist immediately per-file.
    expect(mediclaimApiMock.updateClaim).not.toHaveBeenCalled();
  });

  it("advances to Declaration once every base-required document type has already been uploaded", async () => {
    const user = userEvent.setup();
    setupAtDocuments([
      { id: 1, documentType: "MEDICLAIM_CLAIM_FORM" },
      { id: 2, documentType: "PRESCRIPTION" },
      { id: 3, documentType: "MEDICAL_REPORT" },
      { id: 4, documentType: "HOSPITAL_BILL" },
      { id: 5, documentType: "MEDICINE_BILL" },
    ]);
    await waitFor(() => expect(screen.getByText("Duly Filled Claim Form")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Save & Continue" }));

    await waitFor(() => expect(screen.getByText("Review Summary")).toBeInTheDocument());
  });

  // Per documentChecklistRules.js, Discharge Summary must be REQUIRED for a
  // hospitalization claim. SubmitClaimTab.jsx's mapClaimToFormData()
  // uppercases the server's treatmentType before storing it in formData
  // (`treatmentType: treatmentTypeRaw ? String(treatmentTypeRaw).toUpperCase() : ""`,
  // around line 124), while documentChecklistRules.js's
  // HOSPITALIZED_TREATMENT_TYPES check (and claimValidation.js's
  // TREATMENT_TYPES_REQUIRING_ADMISSION, and this same file's own
  // TREATMENT_TYPES button list) are all strictly lowercase. This asserts
  // the CORRECT/spec behavior per the task's instruction to flag (not
  // silently work around) a suspected bug — see the phase's final report;
  // this file could not be executed in this session, so this expected
  // failure has not been empirically confirmed.
  it("shows Discharge Summary as required when resuming a saved hospitalization claim (suspected real bug, unconfirmed by execution)", async () => {
    mediclaimApiMock.getClaim.mockResolvedValue({
      data: { id: 123, claimNumber: "MC-2026-000123", status: "DRAFT", treatmentType: "hospitalization" },
    });
    mediclaimApiMock.claimDocuments.mockResolvedValue({ data: { data: [] } });
    setup("/employee/tds/mediclaim?tab=submit&claimId=123&wizardStep=documents");

    await waitFor(() => expect(screen.getByText("Discharge Summary")).toBeInTheDocument());

    const dischargeRow = screen.getByText("Discharge Summary").closest("div.min-w-0");
    expect(within(dischargeRow).getByText("Required")).toBeInTheDocument();
  });
});
