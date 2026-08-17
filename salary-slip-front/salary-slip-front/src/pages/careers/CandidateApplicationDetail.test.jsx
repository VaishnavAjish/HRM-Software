import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression coverage for a real gap: `candidateApi.getApplication` existed
// and was fully wired in the API client, but no page ever rendered it —
// candidates had no way to see a single application's progress timeline.

const authState = vi.hoisted(() => ({
  candidate: { name: "Jane Candidate", email: "jane@example.com" },
  token: "candidate-token",
}));

vi.mock("../../context/CandidateAuthContext", () => ({
  useCandidateAuth: () => authState,
}));

const apiState = vi.hoisted(() => ({
  response: {
    status: true,
    data: {
      id: 42,
      job_title: "Senior Software Engineer",
      department_name: "Technology",
      status_label: "Interview",
      applied_at: "2026-08-10T10:00:00Z",
      resume_name: "jane-resume.pdf",
      timeline: [
        { status_label: "Submitted", occurred_at: "2026-08-10T10:00:00Z" },
        { status_label: "Under Review", occurred_at: "2026-08-12T10:00:00Z" },
        { status_label: "Interview", occurred_at: "2026-08-14T10:00:00Z" },
      ],
    },
  },
}));

vi.mock("../../utils/api", () => ({
  candidateApi: {
    getApplication: vi.fn(() => Promise.resolve(apiState.response)),
  },
}));

// Resume blob fetch is a raw `fetch`, not routed through the mocked api client.
globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(["fake"])) }));

import CandidateApplicationDetail from "./CandidateApplicationDetail";
import { candidateApi } from "../../utils/api";

function renderDetail(id = "42") {
  const router = createMemoryRouter(
    [{ path: "/careers/account/applications/:id", element: <CandidateApplicationDetail /> }],
    { initialEntries: [`/careers/account/applications/${id}`] },
  );
  render(<RouterProvider router={router} />);
}

describe("CandidateApplicationDetail", () => {
  beforeEach(() => {
    authState.candidate = { name: "Jane Candidate", email: "jane@example.com" };
    apiState.response = {
      status: true,
      data: {
        id: 42, job_title: "Senior Software Engineer", department_name: "Technology",
        status_label: "Interview", applied_at: "2026-08-10T10:00:00Z", resume_name: "jane-resume.pdf",
        timeline: [
          { status_label: "Submitted", occurred_at: "2026-08-10T10:00:00Z" },
          { status_label: "Under Review", occurred_at: "2026-08-12T10:00:00Z" },
          { status_label: "Interview", occurred_at: "2026-08-14T10:00:00Z" },
        ],
      },
    };
    vi.clearAllMocks();
  });

  it("prompts sign in when no candidate is authenticated", () => {
    authState.candidate = null;
    renderDetail();
    expect(screen.getByText("Sign in to view this application")).toBeInTheDocument();
  });

  it("loads the application and renders the candidate-safe timeline", async () => {
    renderDetail();

    expect(await screen.findByText("Senior Software Engineer")).toBeInTheDocument();
    expect(candidateApi.getApplication).toHaveBeenCalledWith("42", "candidate-token");
    expect(screen.getAllByText("Interview").length).toBeGreaterThan(0);
    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(screen.getByText("Under Review")).toBeInTheDocument();
    expect(screen.getByText("Final Decision — Pending")).toBeInTheDocument();
  });

  it("does not render a pending-decision step once a final status is reached", async () => {
    apiState.response = {
      status: true,
      data: {
        id: 43, job_title: "Product Analyst", department_name: "Analytics",
        status_label: "Closed", applied_at: "2026-08-01T10:00:00Z", resume_name: null,
        timeline: [
          { status_label: "Submitted", occurred_at: "2026-08-01T10:00:00Z" },
          { status_label: "Closed", occurred_at: "2026-08-05T10:00:00Z" },
        ],
      },
    };
    renderDetail("43");

    expect(await screen.findByText("Product Analyst")).toBeInTheDocument();
    expect(screen.queryByText("Final Decision — Pending")).not.toBeInTheDocument();
  });

  it("shows a not-found state when the application does not belong to this candidate", async () => {
    apiState.response = { status: false, message: "Application not found" };
    renderDetail("999");

    expect(await screen.findByText("Application not found")).toBeInTheDocument();
  });
});
