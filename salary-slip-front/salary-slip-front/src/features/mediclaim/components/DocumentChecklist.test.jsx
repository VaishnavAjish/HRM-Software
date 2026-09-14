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
import { CLAIM_DOCUMENT_CHECKLIST } from "../models/documentTypes";

beforeEach(() => {
  uploadClaimDocument.mockReset();
  uploadClaimDocument.mockResolvedValue({ data: {} });
});

function fileInputs(container) {
  return Array.from(container.querySelectorAll('input[type="file"]'));
}

describe("DocumentChecklist — required/optional rows per claim snapshot", () => {
  it("renders all 8 fixed checklist rows with their labels", () => {
    render(<DocumentChecklist claimId="1" claimSnapshot={{}} uploadedDocs={[]} />);
    for (const row of CLAIM_DOCUMENT_CHECKLIST) {
      expect(screen.getByText(row.label)).toBeInTheDocument();
    }
  });

  it("marks Discharge Summary and FIR/MLC optional for a plain OPD, non-medico-legal claim", () => {
    render(
      <DocumentChecklist
        claimId="1"
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
        claimSnapshot={{ treatmentType: "surgery", isMedicoLegal: true }}
        uploadedDocs={[]}
      />,
    );

    const otherRow = screen.getByText("Any Other Supporting Documents").closest("div.min-w-0");
    const badge = otherRow.querySelector("span.rounded-full");
    expect(badge).toHaveTextContent("Optional");
  });

  it("always marks the base rows (claim form, prescription, etc.) required", () => {
    render(<DocumentChecklist claimId="1" claimSnapshot={{ treatmentType: "opd" }} uploadedDocs={[]} />);

    const claimFormRow = screen.getByText("Duly Filled Claim Form").closest("div.min-w-0");
    expect(within(claimFormRow).getByText("Required")).toBeInTheDocument();
  });
});

describe("DocumentChecklist — claim-id gating", () => {
  it("shows a banner and disables uploads when there is no claim id yet", () => {
    const { container } = render(<DocumentChecklist claimId={null} claimSnapshot={{}} uploadedDocs={[]} />);

    expect(screen.getByText(/Save the earlier steps first/i)).toBeInTheDocument();
    for (const input of fileInputs(container)) {
      expect(input).toBeDisabled();
    }
  });

  it("enables uploads once a real claim id is present", () => {
    const { container } = render(<DocumentChecklist claimId="42" claimSnapshot={{}} uploadedDocs={[]} />);

    expect(screen.queryByText(/Save the earlier steps first/i)).not.toBeInTheDocument();
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
      <DocumentChecklist claimId="42" claimSnapshot={{}} uploadedDocs={[]} onUploaded={onUploaded} />,
    );

    const prescriptionIndex = CLAIM_DOCUMENT_CHECKLIST.findIndex((r) => r.documentType === "PRESCRIPTION");
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
      <DocumentChecklist claimId="42" claimSnapshot={{}} uploadedDocs={[]} readOnly />,
    );

    expect(fileInputs(container)).toHaveLength(0);
  });
});
