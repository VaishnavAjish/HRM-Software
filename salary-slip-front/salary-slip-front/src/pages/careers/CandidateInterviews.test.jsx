import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  candidate: { name: "Jane Candidate", email: "jane@example.com" },
  token: "candidate-token",
}));

vi.mock("../../context/CandidateAuthContext", () => ({
  useCandidateAuth: () => authState,
}));

const apiState = vi.hoisted(() => ({ interviews: [] }));

vi.mock("../../utils/api", () => ({
  candidateApi: {
    getInterviews: vi.fn(() => Promise.resolve({ status: true, data: apiState.interviews })),
  },
}));

import CandidateInterviews from "./CandidateInterviews";

function renderPage() {
  return render(
    <MemoryRouter>
      <CandidateInterviews />
    </MemoryRouter>,
  );
}

describe("CandidateInterviews", () => {
  beforeEach(() => {
    authState.candidate = { name: "Jane Candidate", email: "jane@example.com" };
    apiState.interviews = [];
    vi.clearAllMocks();
  });

  it("prompts sign in when no candidate is authenticated", () => {
    authState.candidate = null;
    renderPage();
    expect(screen.getByText("Sign in to view your interviews")).toBeInTheDocument();
  });

  it("shows an honest empty state when nothing is scheduled", async () => {
    renderPage();
    expect(await screen.findByText("No interviews scheduled yet")).toBeInTheDocument();
  });

  it("lists a scheduled interview with candidate-safe fields only", async () => {
    apiState.interviews = [{
      id: 7, round_name: "Technical Round", job_title: "Senior Software Engineer",
      department_name: "Technology", scheduled_at: "2026-08-25T10:00:00Z",
      duration_minutes: 45, mode: "video", meeting_link: "https://meet.example.com/abc", status: "scheduled",
    }];
    renderPage();

    expect(await screen.findByText("Technical Round")).toBeInTheDocument();
    expect(screen.getByText("Senior Software Engineer")).toBeInTheDocument();
    expect(screen.getByText("Scheduled")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Technical Round/ })).toHaveAttribute("href", "/careers/account/interviews/7");
  });
});
