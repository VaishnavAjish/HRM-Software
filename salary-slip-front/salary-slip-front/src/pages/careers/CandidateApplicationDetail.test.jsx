import "../../test/setup";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  candidate: { name: "Jane Candidate", email: "jane@example.com" },
  token: "candidate-token",
}));

vi.mock("../../context/candidate-auth-context", () => ({
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
      stage: "interview",
      applied_at: "2026-08-10T10:00:00Z",
      resume_name: "jane-resume.pdf",
      timeline: [
        { status_label: "Submitted", occurred_at: "2026-08-10T10:00:00Z" },
        { status_label: "Under Review", occurred_at: "2026-08-12T10:00:00Z" },
        { status_label: "Interview", occurred_at: "2026-08-14T10:00:00Z" },
      ],
      interviews: [
        { id: 1, round_name: "Technical Round 1", mode: "video", scheduled_at: "2026-08-15T14:00:00Z", status: "scheduled" },
      ],
      communications: [
        { id: 1, subject: "Welcome to our hiring process", body: "Hello Jane, your application is moving forward.", type: "email", sent_at: "2026-08-11T10:00:00Z" },
      ],
      latest_offer: null,
    },
  },
}));

vi.mock("../../utils/api", () => ({
  candidateApi: {
    getApplication: vi.fn(() => Promise.resolve(apiState.response)),
    respondOffer: vi.fn(() => Promise.resolve({ status: true })),
  },
}));

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
        id: 42,
        job_title: "Senior Software Engineer",
        department_name: "Technology",
        status_label: "Interview",
        stage: "interview",
        applied_at: "2026-08-10T10:00:00Z",
        resume_name: "jane-resume.pdf",
        timeline: [
          { status_label: "Submitted", occurred_at: "2026-08-10T10:00:00Z" },
          { status_label: "Under Review", occurred_at: "2026-08-12T10:00:00Z" },
          { status_label: "Interview", occurred_at: "2026-08-14T10:00:00Z" },
        ],
        interviews: [
          { id: 1, round_name: "Technical Round 1", mode: "video", scheduled_at: "2026-08-15T14:00:00Z", status: "scheduled" },
        ],
        communications: [
          { id: 1, subject: "Welcome to our hiring process", body: "Hello Jane, your application is moving forward.", type: "email", sent_at: "2026-08-11T10:00:00Z" },
        ],
        latest_offer: null,
      },
    };
    vi.clearAllMocks();
  });

  it("prompts sign in when no candidate is authenticated", () => {
    authState.candidate = null;
    renderDetail();
    expect(screen.getByText("Sign in to view this application")).toBeInTheDocument();
  });

  it("loads the application and renders the overview and timeline", async () => {
    renderDetail();

    expect(await screen.findByText("Senior Software Engineer")).toBeInTheDocument();
    expect(candidateApi.getApplication).toHaveBeenCalledWith("42", "candidate-token");
    expect(screen.getAllByText("Interview").length).toBeGreaterThan(0);
    expect(screen.getByText("1. Submitted")).toBeInTheDocument();
    expect(screen.getByText("2. Under Review")).toBeInTheDocument();
  });

  it("renders offer letter when offer is present", async () => {
    apiState.response.data.latest_offer = {
      id: 99,
      designation: "Senior Software Engineer",
      ctc_annual: 1500000,
      status: "released",
      joining_date: "2026-09-01",
      joining_date_formatted: "01 Sep 2026",
    };

    renderDetail("42");

    expect(await screen.findByText("Official Job Offer", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText("Accept Offer")).toBeInTheDocument();
  });

  it("shows a not-found state when the application does not belong to this candidate", async () => {
    apiState.response = { status: false, message: "Application not found" };
    renderDetail("999");

    expect(await screen.findByText("Application not found")).toBeInTheDocument();
  });
});
