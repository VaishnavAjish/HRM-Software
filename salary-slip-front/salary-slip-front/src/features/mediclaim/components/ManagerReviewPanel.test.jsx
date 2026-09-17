import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ user: { accessToken: "test-token", tokenType: "Bearer" } }),
}));

const submitReviewDecision = vi.fn();
const acknowledgeConfidentiality = vi.fn();
vi.mock("../services/mediclaimApi", () => ({
  mediclaimApi: {
    submitReviewDecision: (...args) => submitReviewDecision(...args),
    acknowledgeConfidentiality: (...args) => acknowledgeConfidentiality(...args),
  },
}));

import ManagerReviewPanel from "./ManagerReviewPanel";

const claim = { id: 55, claimNumber: "MC-2026-000055", status: "MANAGER_REVIEW", totalClaimedAmount: 5000 };

beforeEach(() => {
  submitReviewDecision.mockReset();
  submitReviewDecision.mockResolvedValue({ data: { id: 55, status: "COORDINATOR_VERIFICATION" } });
  acknowledgeConfidentiality.mockReset();
  acknowledgeConfidentiality.mockResolvedValue({ data: {} });
});

/**
 * Shared "remarks required unless a clean approve" behavior — exercised
 * through the shell `ReviewPanelShell` every stage panel wraps, but tested
 * here end-to-end through the thinnest real panel (Manager: Approve / Reject
 * / Return, no stage-specific extra fields) so the assertions cover the
 * actual rendered UI, not just `claimValidation.validateReviewDecision` in
 * isolation (already covered in `utils/claimValidation.test.js`).
 */
describe("ManagerReviewPanel — remarks required unless a clean approve", () => {
  it("submits an Approve decision with empty remarks (clean approve, none required)", async () => {
    const user = userEvent.setup();
    const onDecided = vi.fn();
    render(<ManagerReviewPanel claim={claim} onDecided={onDecided} />);

    await user.click(screen.getByRole("button", { name: "Approve" }));
    await user.click(screen.getByRole("button", { name: "Submit Decision" }));

    await waitFor(() => expect(submitReviewDecision).toHaveBeenCalledTimes(1));
    expect(acknowledgeConfidentiality).toHaveBeenCalledWith(55, "test-token", "Bearer");
    expect(submitReviewDecision).toHaveBeenCalledWith(
      55,
      { decision: "approve", remarks: "" },
      "test-token",
      "Bearer",
    );
    await waitFor(() => expect(onDecided).toHaveBeenCalled());
  });

  it("blocks Submit for Reject until remarks are entered", async () => {
    const user = userEvent.setup();
    render(<ManagerReviewPanel claim={claim} />);

    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(screen.getByRole("button", { name: "Submit Decision" })).toBeDisabled();

    await user.type(screen.getByPlaceholderText(/Required/), "Missing hospital bill");
    expect(screen.getByRole("button", { name: "Submit Decision" })).toBeEnabled();
  });

  it("blocks Submit for Return for Correction until remarks are entered", async () => {
    const user = userEvent.setup();
    render(<ManagerReviewPanel claim={claim} />);

    await user.click(screen.getByRole("button", { name: "Return for Correction" }));
    expect(screen.getByRole("button", { name: "Submit Decision" })).toBeDisabled();
  });

  it("shows the field as required (asterisk) only once a non-clean-approve decision is picked", async () => {
    const user = userEvent.setup();
    render(<ManagerReviewPanel claim={claim} />);

    expect(screen.getByText("Remarks").textContent).not.toMatch(/\*/);

    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(screen.getByText("Remarks").textContent).toMatch(/\*/);
  });

  it("submits a Reject decision once valid remarks are entered", async () => {
    const user = userEvent.setup();
    render(<ManagerReviewPanel claim={claim} />);

    await user.click(screen.getByRole("button", { name: "Reject" }));
    await user.type(screen.getByPlaceholderText(/Required/), "Does not meet policy criteria");
    await user.click(screen.getByRole("button", { name: "Submit Decision" }));

    await waitFor(() => expect(submitReviewDecision).toHaveBeenCalledTimes(1));
    expect(submitReviewDecision).toHaveBeenCalledWith(
      55,
      { decision: "reject", remarks: "Does not meet policy criteria" },
      "test-token",
      "Bearer",
    );
  });

  it("shows a server error and does not call onDecided when the API call fails", async () => {
    submitReviewDecision.mockRejectedValueOnce(new Error("Claim already decided by another reviewer."));
    const user = userEvent.setup();
    const onDecided = vi.fn();
    render(<ManagerReviewPanel claim={claim} onDecided={onDecided} />);

    await user.click(screen.getByRole("button", { name: "Approve" }));
    await user.click(screen.getByRole("button", { name: "Submit Decision" }));

    await waitFor(() => expect(screen.getByText("Claim already decided by another reviewer.")).toBeInTheDocument());
    expect(onDecided).not.toHaveBeenCalled();
  });
});
