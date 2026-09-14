import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// RuleBookViewer always mounts `DocumentViewerModal` (even while closed, per
// that component's own `if (!open || !doc) return null` guard running
// *after* its hooks) — DocumentViewerModal calls `useAuth()` unconditionally,
// so this mock is required even though this test never opens the viewer.
vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ user: null }),
}));

import RuleBookViewer from "./RuleBookViewer";

const published = [
  { id: 1, language: "en", status: "published", title: "Mediclaim Rule Book (EN)", effectiveFrom: "2026-01-01", document: { id: 10 } },
  { id: 2, language: "hi", status: "published", title: "मेडिक्लेम नियम पुस्तिका", effectiveFrom: "2026-01-01", document: { id: 11 } },
  // No Gujarati row published — exercises the per-language "not yet published" state.
];

describe("RuleBookViewer", () => {
  it("shows a loading state", () => {
    render(<RuleBookViewer ruleBooks={[]} loading />);
    expect(screen.getByText("Loading rule book…")).toBeInTheDocument();
  });

  it("shows a real error message rather than crashing", () => {
    render(<RuleBookViewer ruleBooks={[]} error="Failed to load rule books." />);
    expect(screen.getByText("Failed to load rule books.")).toBeInTheDocument();
  });

  it("renders an honest, non-alarming empty state when no rule book has ever been published (the seeded launch state)", () => {
    render(<RuleBookViewer ruleBooks={[]} />);

    expect(screen.getByText(/No Mediclaim rule book has been published yet/i)).toBeInTheDocument();
  });

  it("does not surface an unpublished (draft) rule book row at all", () => {
    render(<RuleBookViewer ruleBooks={[{ id: 9, language: "en", status: "draft", title: "Draft copy" }]} />);

    expect(screen.getByText(/No Mediclaim rule book has been published yet/i)).toBeInTheDocument();
    expect(screen.queryByText("Draft copy")).not.toBeInTheDocument();
  });

  it("defaults to the English tab and shows the published English rule book", () => {
    render(<RuleBookViewer ruleBooks={published} />);

    expect(screen.getByText("Mediclaim Rule Book (EN)")).toBeInTheDocument();
  });

  it("switches to Hindi and shows the Hindi rule book", async () => {
    const user = userEvent.setup();
    render(<RuleBookViewer ruleBooks={published} />);

    await user.click(screen.getByRole("button", { name: "हिन्दी" }));

    expect(screen.getByText("मेडिक्लेम नियम पुस्तिका")).toBeInTheDocument();
    expect(screen.queryByText("Mediclaim Rule Book (EN)")).not.toBeInTheDocument();
  });

  it("switches to Gujarati and honestly reports it is not yet published in that language, rather than falling back silently to another language", async () => {
    const user = userEvent.setup();
    render(<RuleBookViewer ruleBooks={published} />);

    await user.click(screen.getByRole("button", { name: "ગુજરાતી" }));

    expect(screen.getByText(/not yet published in ગુજરાતી/)).toBeInTheDocument();
    expect(screen.queryByText("Mediclaim Rule Book (EN)")).not.toBeInTheDocument();
  });

  it("offers a View action for the selected language's published rule book", () => {
    render(<RuleBookViewer ruleBooks={published} />);
    expect(screen.getByRole("button", { name: /View/ })).toBeInTheDocument();
  });
});
