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

// CardViewer also fetches the employee's own profile (for the "self" card's
// photo) independently of `myCards()` — mocked here so it resolves quickly
// and predictably instead of hitting a real, unmocked `fetch`.
vi.mock("../../../utils/api", () => ({
  authApi: { getProfile: vi.fn().mockResolvedValue({ data: {} }) },
}));

// qrcode.react's QRCodeSVG renders an actual QR bitmap as SVG paths, which
// doesn't expose the encoded `value` as a readable DOM attribute — mock it
// to a stub that does, so the "correct verify URL" assertion checks the
// real prop CardViewer passes rather than reverse-engineering pixel data.
vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value, size }) => <svg data-testid="qr-code" data-value={value} width={size} height={size} />,
}));

// html2canvas needs a real browser canvas/rendering pipeline jsdom doesn't
// provide — mock it to a stub that resolves with a fake canvas, so "View
// Card" can be tested without actually rasterizing anything.
const html2canvasMock = vi.fn().mockResolvedValue({ toDataURL: () => "data:image/png;base64,FAKE" });
vi.mock("html2canvas", () => ({ default: (...args) => html2canvasMock(...args) }));

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

  it("renders one card per member with name, masked card number and status", async () => {
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
    expect(screen.getByText("SPOUSE")).toBeInTheDocument();
    expect(screen.getByText("XXXX-4821")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("shows an inline QR with the correct public verify URL when a card carries a verify token, enlargeable in a popup", async () => {
    myCards.mockResolvedValue({
      data: {
        data: [
          { id: 1, memberName: "Priya Shah", cardNumber: "4821", status: "active", verifyToken: "abc123token" },
        ],
      },
    });
    const user = userEvent.setup();
    render(<CardViewer />);

    const expectedValue = `${window.location.origin}/mediclaim/verify/abc123token`;
    const inlineQr = await screen.findByTestId("qr-code");
    expect(inlineQr).toHaveAttribute("data-value", expectedValue);

    await user.click(screen.getByTitle("Tap to enlarge QR"));

    const qrCodes = await screen.findAllByTestId("qr-code");
    expect(qrCodes.length).toBeGreaterThan(1);
    qrCodes.forEach((qr) => expect(qr).toHaveAttribute("data-value", expectedValue));
    expect(screen.getByText("Scan to verify this card")).toBeInTheDocument();
  });

  it("shows a placeholder instead of a QR when a card has no verify token", async () => {
    myCards.mockResolvedValue({
      data: { data: [{ id: 1, memberName: "Priya Shah", cardNumber: "4821", status: "active" }] },
    });
    render(<CardViewer />);

    await waitFor(() => expect(screen.getByText("Priya Shah")).toBeInTheDocument());
    expect(screen.queryByTestId("qr-code")).not.toBeInTheDocument();
  });

  it("captures the card as a PNG image and shows it in a viewable popup, not a PDF download", async () => {
    myCards.mockResolvedValue({
      data: { data: [{ id: 1, memberName: "Priya Shah", cardNumber: "4821", status: "active" }] },
    });
    const user = userEvent.setup();
    render(<CardViewer />);

    await waitFor(() => expect(screen.getByText("Priya Shah")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /View Card/i }));

    expect(html2canvasMock).toHaveBeenCalled();
    const img = await screen.findByAltText("Mediclaim card");
    expect(img).toHaveAttribute("src", "data:image/png;base64,FAKE");
  });
});
