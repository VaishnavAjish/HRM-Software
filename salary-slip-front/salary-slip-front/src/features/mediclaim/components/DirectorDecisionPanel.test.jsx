import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ user: { accessToken: "test-token", tokenType: "Bearer" } }),
}));

const submitReviewDecision = vi.fn();
vi.mock("../services/mediclaimApi", () => ({
  mediclaimApi: { submitReviewDecision: (...args) => submitReviewDecision(...args) },
}));

import DirectorDecisionPanel from "./DirectorDecisionPanel";

const claim = { id: 77, claimNumber: "MC-2026-000077", status: "DIRECTOR_FINAL_APPROVAL", totalClaimedAmount: 10000 };

beforeEach(() => {
  submitReviewDecision.mockReset();
  submitReviewDecision.mockResolvedValue({ data: { id: 77, status: "SETTLEMENT_PENDING" } });
});

describe("DirectorDecisionPanel — Approved Amount required unless Rejected", () => {
  it("shows the Approved Amount field for Approved and blocks Submit until it is filled", async () => {
    const user = userEvent.setup();
    render(<DirectorDecisionPanel claim={claim} />);

    await user.click(screen.getByRole("button", { name: "Approved" }));
    expect(screen.getByText(/Approved Amount \(₹\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit Decision" })).toBeDisabled();
  });

  it("shows the Approved Amount field for Partially Approved too", async () => {
    const user = userEvent.setup();
    render(<DirectorDecisionPanel claim={claim} />);

    await user.click(screen.getByRole("button", { name: "Partially Approved" }));
    expect(screen.getByText(/Approved Amount \(₹\)/)).toBeInTheDocument();
  });

  it("hides the Approved Amount input field once Rejected is picked (ClaimSummaryCard's own Approved Amount summary field is unrelated and stays)", async () => {
    const user = userEvent.setup();
    render(<DirectorDecisionPanel claim={claim} />);

    await user.click(screen.getByRole("button", { name: "Rejected" }));
    expect(screen.queryByText(/Approved Amount \(₹\)/)).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("submits Approved with a valid amount and remarks left empty (clean approve)", async () => {
    const user = userEvent.setup();
    const onDecided = vi.fn();
    render(<DirectorDecisionPanel claim={claim} onDecided={onDecided} />);

    await user.click(screen.getByRole("button", { name: "Approved" }));
    const amountInput = screen.getByRole("spinbutton");
    await user.type(amountInput, "9500");
    await user.click(screen.getByRole("button", { name: "Submit Decision" }));

    await waitFor(() => expect(submitReviewDecision).toHaveBeenCalledTimes(1));
    expect(submitReviewDecision).toHaveBeenCalledWith(
      77,
      { decision: "APPROVED", remarks: "", approvedAmount: 9500 },
      "test-token",
      "Bearer",
    );
    await waitFor(() => expect(onDecided).toHaveBeenCalled());
  });

  it("rejects an approved amount greater than the claimed total and keeps Submit disabled", async () => {
    const user = userEvent.setup();
    render(<DirectorDecisionPanel claim={claim} />);

    await user.click(screen.getByRole("button", { name: "Approved" }));
    await user.type(screen.getByRole("spinbutton"), "999999");

    expect(screen.getByText(/cannot exceed the total claimed amount/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit Decision" })).toBeDisabled();
  });

  it("submits Rejected with only remarks and no approvedAmount field in the payload", async () => {
    const user = userEvent.setup();
    render(<DirectorDecisionPanel claim={claim} />);

    await user.click(screen.getByRole("button", { name: "Rejected" }));
    await user.type(screen.getByPlaceholderText(/Required/), "Does not qualify under policy");
    await user.click(screen.getByRole("button", { name: "Submit Decision" }));

    await waitFor(() => expect(submitReviewDecision).toHaveBeenCalledTimes(1));
    const payload = submitReviewDecision.mock.calls[0][1];
    expect(payload).toEqual({ decision: "REJECTED", remarks: "Does not qualify under policy" });
    expect(payload.approvedAmount).toBeUndefined();
  });

  it("requires remarks for Partially Approved even though it also needs an approved amount", async () => {
    const user = userEvent.setup();
    render(<DirectorDecisionPanel claim={claim} />);

    await user.click(screen.getByRole("button", { name: "Partially Approved" }));
    await user.type(screen.getByRole("spinbutton"), "5000");

    expect(screen.getByRole("button", { name: "Submit Decision" })).toBeDisabled();

    await user.type(screen.getByPlaceholderText(/Required/), "Some items disallowed per policy");
    expect(screen.getByRole("button", { name: "Submit Decision" })).toBeEnabled();
  });
});
