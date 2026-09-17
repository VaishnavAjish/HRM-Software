import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ user: { accessToken: "test-token", tokenType: "Bearer" } }),
}));

const uploadClaimDocument = vi.fn();
vi.mock("../services/mediclaimApi", () => ({
  mediclaimApi: { uploadClaimDocument: (...args) => uploadClaimDocument(...args) },
}));

import DocumentChecklist from "./DocumentChecklist";

// Mirrors the seeded defaults in
// 2026_09_16_000003_create_mediclaim_document_requirements_table.php.
const REQUIREMENTS_FIXTURE = [
  { id: 1, documentType: "MEDICLAIM_CLAIM_FORM", label: "Duly Filled Claim Form", isRequired: true, conditionalRule: null, sortOrder: 1 },
  { id: 2, documentType: "PRESCRIPTION", label: "Doctor Prescription", isRequired: true, conditionalRule: null, sortOrder: 2 },
  { id: 3, documentType: "MEDICAL_REPORT", label: "Medical Reports", isRequired: true, conditionalRule: null, sortOrder: 3 },
  { id: 4, documentType: "HOSPITAL_BILL", label: "Hospital Main Bill & Break-up", isRequired: true, conditionalRule: null, sortOrder: 4 },
  { id: 5, documentType: "MEDICINE_BILL", label: "Medicine Bills", isRequired: true, conditionalRule: null, sortOrder: 5 },
  { id: 6, documentType: "DISCHARGE_SUMMARY", label: "Discharge Summary", isRequired: false, conditionalRule: "hospitalized_or_surgery", sortOrder: 6 },
  { id: 7, documentType: "FIR_MLC", label: "FIR / MLC", isRequired: false, conditionalRule: "medico_legal", sortOrder: 7 },
  { id: 8, documentType: "OTHER", label: "Any Other Supporting Documents", isRequired: false, conditionalRule: null, sortOrder: 8 },
];

beforeEach(() => {
  uploadClaimDocument.mockReset();
  uploadClaimDocument.mockResolvedValue({ data: {} });
});

function fileInputs(container) {
  return Array.from(container.querySelectorAll('input[type="file"]'));
}

describe("DocumentChecklist — required/optional rows per claim snapshot", () => {
  it("renders every requirement row with its label", () => {
    render(<DocumentChecklist claimId="1" requirements={REQUIREMENTS_FIXTURE} claimSnapshot={{}} uploadedDocs={[]} />);
    for (const row of REQUIREMENTS_FIXTURE) {
      expect(screen.getByText(row.label)).toBeInTheDocument();
    }
  });

  it("renders a loading placeholder when the requirements list hasn't loaded yet", () => {
    render(<DocumentChecklist claimId="1" requirements={[]} requirementsLoading claimSnapshot={{}} uploadedDocs={[]} />);
    expect(screen.getByText(/Loading the document checklist/i)).toBeInTheDocument();
  });

  it("renders an honest 'not configured' message (not a stuck loading placeholder) once loading has finished and nothing came back", () => {
    render(<DocumentChecklist claimId="1" requirements={[]} claimSnapshot={{}} uploadedDocs={[]} />);
    expect(screen.queryByText(/Loading the document checklist/i)).not.toBeInTheDocument();
    expect(screen.getByText(/No document types have been configured yet/i)).toBeInTheDocument();
  });

  it("marks Discharge Summary and FIR/MLC optional for a plain OPD, non-medico-legal claim", () => {
    render(
      <DocumentChecklist
        claimId="1"
        requirements={REQUIREMENTS_FIXTURE}
        claimSnapshot={{ treatmentType: "opd", isMedicoLegal: false }}
        uploadedDocs={[]}
      />,
    );

    const dischargeRow = screen.getByText("Discharge Summary").closest("div.min-w-0");
    expect(within(dischargeRow).getByText("Optional")).toBeInTheDocument();

    const firRow = screen.getByText("FIR / MLC").closest("div.min-w-0");
    expect(within(firRow).getByText("Optional")).toBeInTheDocument();
  });

  it("marks Discharge Summary and FIR/MLC required for a hospitalization + medico-legal claim", () => {
    render(
      <DocumentChecklist
        claimId="1"
        requirements={REQUIREMENTS_FIXTURE}
        claimSnapshot={{ treatmentType: "hospitalization", isMedicoLegal: true }}
        uploadedDocs={[]}
      />,
    );

    const dischargeRow = screen.getByText("Discharge Summary").closest("div.min-w-0");
    expect(within(dischargeRow).getByText("Required")).toBeInTheDocument();

    const firRow = screen.getByText("FIR / MLC").closest("div.min-w-0");
    expect(within(firRow).getByText("Required")).toBeInTheDocument();
  });

  it("always marks 'Any Other Supporting Documents' optional", () => {
    render(
      <DocumentChecklist
        claimId="1"
        requirements={REQUIREMENTS_FIXTURE}
        claimSnapshot={{ treatmentType: "surgery", isMedicoLegal: true }}
        uploadedDocs={[]}
      />,
    );

    const otherRow = screen.getByText("Any Other Supporting Documents").closest("div.min-w-0");
    const badge = otherRow.querySelector("span.rounded-full");
    expect(badge).toHaveTextContent("Optional");
  });

  it("always marks the base rows (claim form, prescription, etc.) required", () => {
    render(<DocumentChecklist claimId="1" requirements={REQUIREMENTS_FIXTURE} claimSnapshot={{ treatmentType: "opd" }} uploadedDocs={[]} />);

    const claimFormRow = screen.getByText("Duly Filled Claim Form").closest("div.min-w-0");
    expect(within(claimFormRow).getByText("Required")).toBeInTheDocument();
  });
});

describe("DocumentChecklist — claim-id gating", () => {
  it("shows a banner and disables uploads when there is no claim id yet", () => {
    const { container } = render(<DocumentChecklist claimId={null} requirements={REQUIREMENTS_FIXTURE} claimSnapshot={{}} uploadedDocs={[]} />);

    expect(screen.getByText(/Document upload unlocks/i)).toBeInTheDocument();
    for (const input of fileInputs(container)) {
      expect(input).toBeDisabled();
    }
  });

  it("enables uploads once a real claim id is present", () => {
    const { container } = render(<DocumentChecklist claimId="42" requirements={REQUIREMENTS_FIXTURE} claimSnapshot={{}} uploadedDocs={[]} />);

    expect(screen.queryByText(/Document upload unlocks/i)).not.toBeInTheDocument();
    for (const input of fileInputs(container)) {
      expect(input).not.toBeDisabled();
    }
  });
});

describe("DocumentChecklist — already-uploaded documents", () => {
  it("shows an uploaded document as a chip on its row", () => {
    render(
      <DocumentChecklist
        claimId="1"
        requirements={REQUIREMENTS_FIXTURE}
        claimSnapshot={{}}
        uploadedDocs={[{ id: 9, documentType: "PRESCRIPTION", fileName: "rx.pdf" }]}
      />,
    );

    expect(screen.getByText("rx.pdf")).toBeInTheDocument();
  });
});

describe("DocumentChecklist — upload flow", () => {
  it("calls mediclaimApi.uploadClaimDocument with the row's document type and the claim id, then refreshes via onUploaded", async () => {
    const user = userEvent.setup();
    const onUploaded = vi.fn();
    const { container } = render(
      <DocumentChecklist claimId="42" requirements={REQUIREMENTS_FIXTURE} claimSnapshot={{}} uploadedDocs={[]} onUploaded={onUploaded} />,
    );

    const prescriptionIndex = REQUIREMENTS_FIXTURE.findIndex((r) => r.documentType === "PRESCRIPTION");
    const input = fileInputs(container)[prescriptionIndex];
    const file = new File(["contents"], "rx.pdf", { type: "application/pdf" });

    await user.upload(input, file);

    await waitFor(() => expect(uploadClaimDocument).toHaveBeenCalledTimes(1));
    expect(uploadClaimDocument).toHaveBeenCalledWith(
      "42",
      { file, documentType: "PRESCRIPTION" },
      "test-token",
      "Bearer",
    );
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
  });

  it("does not render upload controls at all in readOnly mode", () => {
    const { container } = render(
      <DocumentChecklist claimId="42" requirements={REQUIREMENTS_FIXTURE} claimSnapshot={{}} uploadedDocs={[]} readOnly />,
    );

    expect(fileInputs(container)).toHaveLength(0);
  });
});
