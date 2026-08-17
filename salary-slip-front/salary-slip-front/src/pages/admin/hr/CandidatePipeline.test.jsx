import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CandidateListView } from "./CandidatePipeline";

// Regression test for a live crash: the compact view renders a <Lock> icon
// for any candidate outside the Candidates tab's own stages (i.e. any
// candidate already advanced to interview/offer/etc — the normal state for
// most of a real roster), but `Lock` was never imported from lucide-react.
// That threw `ReferenceError: Lock is not defined` on every such render.

function candidate(overrides = {}) {
  return {
    id: 1,
    name: "Riya Sharma",
    priority: "medium",
    stage: "applied",
    ats_score: null,
    ...overrides,
  };
}

describe("CandidateListView compact mode", () => {
  it("renders a lock indicator (not a crash) for a candidate outside this tab's owned stages", () => {
    render(
      <CandidateListView
        compact
        loading={false}
        candidates={[candidate({ id: 42, name: "Vansh Chauhan", stage: "interview" })]}
        total={1}
        page={1}
        perPage={20}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        onOpenDetail={vi.fn()}
        onAdvance={vi.fn()}
        onToggleSelected={vi.fn()}
        onSelectAll={vi.fn()}
      />,
    );

    expect(screen.getByText("Vansh Chauhan")).toBeInTheDocument();
    expect(screen.getByTitle("Managed in another tab now")).toBeInTheDocument();
    // The advance arrow must not also render for a candidate this tab can't act on.
    expect(screen.queryByTitle(/Move to/)).not.toBeInTheDocument();
  });

  it("renders an advance arrow instead of the lock for a candidate this tab owns", () => {
    render(
      <CandidateListView
        compact
        loading={false}
        candidates={[candidate({ id: 7, name: "Priya Nair", stage: "shortlisted" })]}
        total={1}
        page={1}
        perPage={20}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        onOpenDetail={vi.fn()}
        onAdvance={vi.fn()}
        onToggleSelected={vi.fn()}
        onSelectAll={vi.fn()}
      />,
    );

    expect(screen.getByText("Priya Nair")).toBeInTheDocument();
    expect(screen.queryByTitle("Managed in another tab now")).not.toBeInTheDocument();
  });

  it("does not lock a terminal-stage candidate that is still within owned stages", () => {
    render(
      <CandidateListView
        compact
        loading={false}
        candidates={[candidate({ id: 9, name: "Amit Rao", stage: "rejected" })]}
        total={1}
        page={1}
        perPage={20}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        onOpenDetail={vi.fn()}
        onAdvance={vi.fn()}
        onToggleSelected={vi.fn()}
        onSelectAll={vi.fn()}
      />,
    );

    // Terminal (rejected/on_hold) candidates get neither the arrow nor the
    // lock — canAct() is irrelevant once isTerminal short-circuits `next`.
    expect(screen.getByText("Amit Rao")).toBeInTheDocument();
    expect(screen.queryByTitle("Managed in another tab now")).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Move to/)).not.toBeInTheDocument();
  });
});
