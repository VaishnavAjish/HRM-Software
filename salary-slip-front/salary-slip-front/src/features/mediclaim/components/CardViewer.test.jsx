import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ user: { accessToken: "test-token", tokenType: "Bearer" } }),
}));

const myCards = vi.fn();
vi.mock("../services/mediclaimApi", () => ({
  mediclaimApi: { myCards: (...args) => myCards(...args) },
}));

// qrcode.react's QRCodeSVG renders an actual QR bitmap as SVG paths, which
// doesn't expose the encoded `value` as a readable DOM attribute — mock it
// to a stub that does, so the "correct verify URL" assertion checks the
// real prop CardViewer passes rather than reverse-engineering pixel data.
vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value, size }) => <svg data-testid="qr-code" data-value={value} width={size} height={size} />,
}));

import CardViewer from "./CardViewer";

beforeEach(() => {
  myCards.mockReset();
});

describe("CardViewer", () => {
  it("shows an honest empty state with no cards issued yet", async () => {
    myCards.mockResolvedValue({ data: { data: [] } });
    render(<CardViewer />);

    await waitFor(() => expect(screen.getByText(/No Mediclaim cards issued yet/i)).toBeInTheDocument());
  });

  it("shows a real error message rather than a blank table when the API call fails", async () => {
    myCards.mockRejectedValue(new Error("Failed to load Mediclaim cards."));
    render(<CardViewer />);

    await waitFor(() => expect(screen.getByText("Failed to load Mediclaim cards.")).toBeInTheDocument());
  });

  it("renders one row per card with member name, masked card number and status", async () => {
    myCards.mockResolvedValue({
      data: {
        data: [
          {
            id: 1, memberName: "Priya Shah", relationshipType: "SPOUSE",
            cardNumber: "1234567890124821", status: "active",
            validFrom: "2026-01-01", validTo: "2026-12-31",
          },
        ],
      },
    });
    render(<CardViewer />);

    await waitFor(() => expect(screen.getByText("Priya Shah")).toBeInTheDocument());
    expect(screen.getByText("(SPOUSE)")).toBeInTheDocument();
    expect(screen.getByText("XXXX-4821")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("shows a QR code with the correct public verify URL when a card carries a verify token", async () => {
    myCards.mockResolvedValue({
      data: {
        data: [
          { id: 1, memberName: "Priya Shah", cardNumber: "4821", status: "active", verifyToken: "abc123token" },
        ],
      },
    });
    const user = userEvent.setup();
    render(<CardViewer />);

    await waitFor(() => expect(screen.getByTitle("QR code")).toBeInTheDocument());
    await user.click(screen.getByTitle("QR code"));

    const qr = await screen.findByTestId("qr-code");
    expect(qr).toHaveAttribute("data-value", `${window.location.origin}/mediclaim/verify/abc123token`);
    expect(screen.getByText("Scan to verify this card")).toBeInTheDocument();
  });

  it("hides the QR action when a card has no verify token", async () => {
    myCards.mockResolvedValue({
      data: { data: [{ id: 1, memberName: "Priya Shah", cardNumber: "4821", status: "active" }] },
    });
    render(<CardViewer />);

    await waitFor(() => expect(screen.getByText("Priya Shah")).toBeInTheDocument());
    expect(screen.queryByTitle("QR code")).not.toBeInTheDocument();
  });
});
