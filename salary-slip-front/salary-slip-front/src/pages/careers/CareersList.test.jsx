import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression coverage for a live bug: a real published job never appeared
// on the Career Portal. Root cause was in `publicJobApi.getJobs` (see
// utils/publicJobApi.test.js) — these tests instead lock in this page's
// own contract: it must render whatever the API actually returns, and it
// must never collapse "the request failed" into the same UI as "there are
// genuinely no jobs".

vi.mock("../../context/CandidateAuthContext", () => ({
  useCandidateAuth: () => ({ isAuthenticated: false, token: null }),
}));

const apiState = vi.hoisted(() => ({
  response: { status: true, data: { data: [] } },
  shouldReject: false,
}));

vi.mock("../../utils/api", () => ({
  publicJobApi: {
    getJobs: vi.fn(() => (apiState.shouldReject ? Promise.reject(new Error("Network error")) : Promise.resolve(apiState.response))),
  },
  candidateApi: {
    getSavedJobs: vi.fn(() => Promise.resolve({ status: true, data: [] })),
  },
}));

import CareersList from "./CareersList";
import { publicJobApi } from "../../utils/api";

const JOB = {
  id: 52, title: "Senior Software Engineer", designation: "SSE",
  employment_type: "full_time", min_experience: 3, max_experience: 5,
  company_code: "nidhi-impex", unit: "Shreeji", posted_at: "2026-08-17T06:20:52Z",
  department: { id: 16, name: "Technology" },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <CareersList />
    </MemoryRouter>,
  );
}

describe("CareersList", () => {
  beforeEach(() => {
    apiState.response = { status: true, data: { data: [] } };
    apiState.shouldReject = false;
    vi.clearAllMocks();
  });

  it("renders a published job returned by the API", async () => {
    apiState.response = { status: true, data: { data: [JOB] } };
    renderPage();

    expect(await screen.findByText("Senior Software Engineer")).toBeInTheDocument();
    expect(screen.getByText("1 open position")).toBeInTheDocument();
  });

  it("links the job card to its detail page", async () => {
    apiState.response = { status: true, data: { data: [JOB] } };
    renderPage();

    const link = await screen.findByRole("link", { name: /Senior Software Engineer/ });
    expect(link).toHaveAttribute("href", "/careers/jobs/52");
  });

  it("shows a true-empty state distinct from a filtered-empty state", async () => {
    renderPage();
    expect(await screen.findByText("No open positions are currently available")).toBeInTheDocument();
  });

  it("shows a filtered-empty state once a search term is entered", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("No open positions are currently available");

    await user.type(screen.getByPlaceholderText("Job title, skills, keywords…"), "nonexistent-role");
    await user.click(screen.getByRole("button", { name: "Search Jobs" }));

    expect(await screen.findByText("No open positions match your search")).toBeInTheDocument();
  });

  it("shows a distinct error state when the API request fails, never presenting it as zero jobs", async () => {
    apiState.shouldReject = true;
    renderPage();

    expect(await screen.findByText("Unable to load open positions")).toBeInTheDocument();
    expect(screen.queryByText("No open positions are currently available")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try Again" })).toBeInTheDocument();
  });

  it("recovers from an error state on retry", async () => {
    apiState.shouldReject = true;
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Unable to load open positions");

    apiState.shouldReject = false;
    apiState.response = { status: true, data: { data: [JOB] } };
    await user.click(screen.getByRole("button", { name: "Try Again" }));

    expect(await screen.findByText("Senior Software Engineer")).toBeInTheDocument();
  });

  it("never sends undefined-valued filters on the default, untouched page load", async () => {
    renderPage();

    await waitFor(() => expect(publicJobApi.getJobs).toHaveBeenCalledWith({
      search: undefined,
      employment_type: undefined,
      company_code: undefined,
    }));
  });
});
