import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyCard = vi.fn();
vi.mock("../../features/mediclaim/services/mediclaimApi", () => ({
  mediclaimApi: { verifyCard: (...args) => verifyCard(...args) },
}));

import MediclaimCardVerify from "./MediclaimCardVerify";

function renderAt(token) {
  return render(
    <MemoryRouter initialEntries={[`/mediclaim/verify/${token}`]}>
      <Routes>
        <Route path="/mediclaim/verify/:token" element={<MediclaimCardVerify />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  verifyCard.mockReset();
});

describe("MediclaimCardVerify — no auth ever sent", () => {
  it("calls mediclaimApi.verifyCard with only the token — no accessToken/auth argument", async () => {
    verifyCard.mockResolvedValue({ data: { valid: true, member_name: "Test Employee" } });
    renderAt("plain-qr-token-abc123");

    await waitFor(() => expect(verifyCard).toHaveBeenCalledTimes(1));
    expect(verifyCard).toHaveBeenCalledWith("plain-qr-token-abc123");
    expect(verifyCard.mock.calls[0]).toHaveLength(1);
  });
});

describe("MediclaimCardVerify — a valid token", () => {
  const payload = {
    valid: true,
    member_name: "Priya Shah",
    member_number_masked: "XXXX-4821",
    policy_number_masked: "MC-POL-XXXX-07",
    company: "Nidhi Impex",
    insurer_name: "Star Health",
    valid_from: "2026-01-01",
    valid_to: "2026-12-31",
    approved_hospitals: [{ name: "Surat Diamond Hospital", city: "Surat" }],
    emergency_contact: { designation: "Mediclaim Coordinator", phone: "9998887777" },
  };

  it("renders exactly the whitelisted fields the backend returns", async () => {
    verifyCard.mockResolvedValue({ data: payload });
    renderAt("good-token");

    await waitFor(() => expect(screen.getByText("Priya Shah")).toBeInTheDocument());
    expect(screen.getByText("Nidhi Impex")).toBeInTheDocument();
    expect(screen.getByText("XXXX-4821")).toBeInTheDocument();
    expect(screen.getByText("MC-POL-XXXX-07")).toBeInTheDocument();
    expect(screen.getByText("Star Health")).toBeInTheDocument();
    expect(screen.getByText("Surat Diamond Hospital")).toBeInTheDocument();
    expect(screen.getByText("Mediclaim Coordinator")).toBeInTheDocument();
    expect(screen.getByText("9998887777")).toBeInTheDocument();
    expect(screen.getByText("Verified Mediclaim Card")).toBeInTheDocument();
  });

  it("never renders any diagnostic/internal field beyond the whitelist (e.g. no raw member/policy number, no employee code)", async () => {
    verifyCard.mockResolvedValue({ data: payload });
    renderAt("good-token");

    await waitFor(() => expect(screen.getByText("Priya Shah")).toBeInTheDocument());
    expect(screen.queryByText(/EMP-/)).not.toBeInTheDocument();
    expect(screen.queryByText(/diagnosis/i)).not.toBeInTheDocument();
  });

  it("handles a response with no approved_hospitals/emergency_contact gracefully (both are optional per the whitelist)", async () => {
    verifyCard.mockResolvedValue({ data: { valid: true, member_name: "Priya Shah", company: "Nidhi Impex" } });
    renderAt("good-token");

    await waitFor(() => expect(screen.getByText("Priya Shah")).toBeInTheDocument());
    expect(screen.queryByText("Approved Hospitals")).not.toBeInTheDocument();
    expect(screen.queryByText("Emergency Contact")).not.toBeInTheDocument();
  });
});

describe("MediclaimCardVerify — invalid/expired token", () => {
  it("shows a generic failure message with no diagnostic detail when the server reports the token invalid", async () => {
    verifyCard.mockResolvedValue({ data: { valid: false } });
    renderAt("bad-token");

    await waitFor(() => expect(screen.getByText("This card could not be verified")).toBeInTheDocument());
    expect(screen.queryByText(/revoked/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/expired/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/does not exist/i)).not.toBeInTheDocument();
  });

  it("shows the same generic failure message on a network/request error, never the underlying error text", async () => {
    verifyCard.mockRejectedValue(new Error("404 Not Found: card_not_found"));
    renderAt("bad-token");

    await waitFor(() => expect(screen.getByText("This card could not be verified")).toBeInTheDocument());
    expect(screen.queryByText(/card_not_found/)).not.toBeInTheDocument();
    expect(screen.queryByText(/404/)).not.toBeInTheDocument();
  });

  it("renders identically (same generic message) whether the token never existed or was revoked — both collapse to the same UI, mirroring the backend's identical-404 privacy design", async () => {
    verifyCard.mockResolvedValue({ data: { valid: false } });
    const { unmount } = renderAt("never-existed-token");
    await waitFor(() => expect(screen.getByText("This card could not be verified")).toBeInTheDocument());
    const neverExistedHtml = screen.getByText("This card could not be verified").closest("div").innerHTML;
    unmount();

    verifyCard.mockRejectedValue(new Error("revoked"));
    renderAt("revoked-token");
    await waitFor(() => expect(screen.getByText("This card could not be verified")).toBeInTheDocument());
    const revokedHtml = screen.getByText("This card could not be verified").closest("div").innerHTML;

    expect(revokedHtml).toBe(neverExistedHtml);
  });
});
