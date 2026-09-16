import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import RuleBookViewer from "./RuleBookViewer";

const published = [
  {
    id: 1,
    languageId: 10,
    language: { id: 10, name: "English", nativeName: "English" },
    status: "published",
    versionLabel: "v1",
    effectiveFrom: "2026-01-01",
    items: [
      { id: 101, ruleText: "Rule one in English" },
      { id: 102, ruleText: "Rule two in English" },
    ],
  },
  {
    id: 2,
    languageId: 11,
    language: { id: 11, name: "Hindi", nativeName: "हिन्दी" },
    status: "published",
    items: [{ id: 201, ruleText: "हिन्दी नियम एक" }],
  },
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

  it("renders an honest, non-alarming empty state when no rule book has ever been published", () => {
    render(<RuleBookViewer ruleBooks={[]} />);

    expect(screen.getByText(/No Mediclaim rule book has been published yet/i)).toBeInTheDocument();
  });

  it("does not offer an unpublished (draft) rule book's language at all", () => {
    render(<RuleBookViewer ruleBooks={[{ id: 9, languageId: 10, language: { id: 10, name: "English" }, status: "draft", items: [{ id: 1, ruleText: "Draft rule" }] }]} />);

    expect(screen.getByText(/No Mediclaim rule book has been published yet/i)).toBeInTheDocument();
    expect(screen.queryByText("Draft rule")).not.toBeInTheDocument();
  });

  it("shows a language picker first — no rule text until a language is chosen", () => {
    render(<RuleBookViewer ruleBooks={published} />);

    expect(screen.getByText(/Choose a language/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "हिन्दी" })).toBeInTheDocument();
    expect(screen.queryByText("Rule one in English")).not.toBeInTheDocument();
  });

  it("shows that language's rules after it is picked, labeled by its own native name", async () => {
    const user = userEvent.setup();
    render(<RuleBookViewer ruleBooks={published} />);

    await user.click(screen.getByRole("button", { name: "हिन्दी" }));

    expect(screen.getByText("हिन्दी नियम एक")).toBeInTheDocument();
    expect(screen.queryByText("Rule one in English")).not.toBeInTheDocument();
    expect(screen.queryByText(/Choose a language/i)).not.toBeInTheDocument();
  });

  it("returns to the language picker via Change language", async () => {
    const user = userEvent.setup();
    render(<RuleBookViewer ruleBooks={published} />);

    await user.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByText("Rule one in English")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Change language/i }));

    expect(screen.getByText(/Choose a language/i)).toBeInTheDocument();
    expect(screen.queryByText("Rule one in English")).not.toBeInTheDocument();
  });

  it("shows a per-language empty state when the picked language's rule book has no rules yet", async () => {
    const user = userEvent.setup();
    render(<RuleBookViewer ruleBooks={[{ id: 3, languageId: 10, language: { id: 10, name: "English", nativeName: "English" }, status: "published", items: [] }]} />);

    await user.click(screen.getByRole("button", { name: "English" }));

    expect(screen.getByText(/has no rules published yet in English/)).toBeInTheDocument();
  });

  it("still requires picking the language even when only one is published", () => {
    render(<RuleBookViewer ruleBooks={[published[0]]} />);

    expect(screen.getByText(/Choose a language/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
    expect(screen.queryByText("Rule one in English")).not.toBeInTheDocument();
  });
});
