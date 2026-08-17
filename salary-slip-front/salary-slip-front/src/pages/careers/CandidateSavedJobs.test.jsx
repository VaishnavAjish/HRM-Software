import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  candidate: { name: "Jane Candidate", email: "jane@example.com" },
  token: "candidate-token",
}));

vi.mock("../../context/CandidateAuthContext", () => ({
  useCandidateAuth: () => authState,
}));

const apiState = vi.hoisted(() => ({ savedJobs: [] }));

vi.mock("../../utils/api", () => ({
  candidateApi: {
    getSavedJobs: vi.fn(() => Promise.resolve({ status: true, data: apiState.savedJobs })),
    unsaveJob: vi.fn(() => Promise.resolve({ status: true })),
  },
}));

import CandidateSavedJobs from "./CandidateSavedJobs";
import { candidateApi } from "../../utils/api";

function renderPage() {
  return render(
    <MemoryRouter>
      <CandidateSavedJobs />
    </MemoryRouter>,
  );
}

describe("CandidateSavedJobs", () => {
  beforeEach(() => {
    authState.candidate = { name: "Jane Candidate", email: "jane@example.com" };
    apiState.savedJobs = [];
    vi.clearAllMocks();
  });

  it("prompts sign in when no candidate is authenticated", () => {
    authState.candidate = null;
    renderPage();
    expect(screen.getByText("Sign in to view saved jobs")).toBeInTheDocument();
  });

  it("shows an honest empty state when nothing is saved", async () => {
    renderPage();
    expect(await screen.findByText("No saved jobs yet")).toBeInTheDocument();
  });

  it("lists a saved job and marks it as open", async () => {
    apiState.savedJobs = [{
      saved_job_id: 1, saved_at: "2026-08-17T10:00:00Z", is_open: true,
      job: { id: 42, title: "Senior Software Engineer", department: { id: 1, name: "Technology" }, employment_type: "full_time", company_code: "nidhi-impex", unit: null },
    }];
    renderPage();

    expect(await screen.findByText("Senior Software Engineer")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Job" })).toHaveAttribute("href", "/careers/jobs/42");
  });

  it("marks a closed job as no longer available and hides the View Job link", async () => {
    apiState.savedJobs = [{
      saved_job_id: 2, saved_at: "2026-08-17T10:00:00Z", is_open: false,
      job: { id: 43, title: "Old Listing", department: null, employment_type: "full_time", company_code: "nidhi-impex", unit: null },
    }];
    renderPage();

    expect(await screen.findByText("No longer available")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View Job" })).not.toBeInTheDocument();
  });

  it("removes a saved job", async () => {
    apiState.savedJobs = [{
      saved_job_id: 3, saved_at: "2026-08-17T10:00:00Z", is_open: true,
      job: { id: 44, title: "Product Analyst", department: null, employment_type: "full_time", company_code: "nidhi-impex", unit: null },
    }];
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Product Analyst");
    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(candidateApi.unsaveJob).toHaveBeenCalledWith(44, "candidate-token"));
    expect(screen.queryByText("Product Analyst")).not.toBeInTheDocument();
  });
});
