import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression coverage for a real gap: the Apply flow only gated on
// authentication and email verification, so a signed-in candidate with an
// empty profile could submit an application recruiters had nothing to
// evaluate. Apply is now also gated on profile completion, with a toast the
// moment a blocked candidate tries.

const authState = vi.hoisted(() => ({
  candidate: null,
  token: "candidate-token",
  isAuthenticated: false,
}));

vi.mock("../../context/CandidateAuthContext", () => ({
  useCandidateAuth: () => authState,
}));

const jobState = vi.hoisted(() => ({
  response: {
    status: true,
    data: { id: 7, title: "Backend Engineer", employment_type: "full_time", requisition_experience_min: 0 },
  },
}));

vi.mock("../../utils/api", () => ({
  publicJobApi: { getJob: vi.fn(() => Promise.resolve(jobState.response)) },
  candidateApi: {
    getSavedJobs: vi.fn(() => Promise.resolve({ status: true, data: [] })),
    apply: vi.fn(() => Promise.resolve({ status: true })),
  },
}));

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: toast }));

import JobDetail from "./JobDetail";

function renderJobDetail() {
  const router = createMemoryRouter(
    [{ path: "/careers/jobs/:slug", element: <JobDetail /> }],
    { initialEntries: ["/careers/jobs/7"] },
  );
  render(<RouterProvider router={router} />);
}

describe("JobDetail apply gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isAuthenticated = false;
    authState.candidate = null;
  });

  it("opens the sign-in gate for an unauthenticated visitor", async () => {
    renderJobDetail();

    fireEvent.click((await screen.findAllByText("Apply Now"))[0]);

    expect(await screen.findByText("Sign in to apply")).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("blocks an unverified candidate and does not fire the profile-incomplete toast", async () => {
    authState.isAuthenticated = true;
    authState.candidate = { id: 1, name: "Jane", email: "jane@example.com", email_verified_at: null };
    renderJobDetail();

    fireEvent.click((await screen.findAllByText("Apply Now"))[0]);

    expect(await screen.findByText("Verify your email to apply")).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows a toast and the complete-profile gate for a verified but incomplete profile", async () => {
    authState.isAuthenticated = true;
    authState.candidate = {
      id: 1, name: "Jane", email: "jane@example.com", email_verified_at: "2026-01-01T00:00:00Z",
      phone: null, current_company: null, current_designation: null, experience_years: null, skills: [],
    };
    renderJobDetail();

    fireEvent.click((await screen.findAllByText("Apply Now"))[0]);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Please complete your profile before applying."));
    expect(await screen.findByText("Complete your profile to apply")).toBeInTheDocument();
    expect(screen.getByText("Complete Profile").closest("a")).toHaveAttribute("href", "/careers/account/profile");
  });

  it("shows the real application form once the profile is complete", async () => {
    authState.isAuthenticated = true;
    authState.candidate = {
      id: 1, name: "Jane", email: "jane@example.com", email_verified_at: "2026-01-01T00:00:00Z",
      phone: "9999999999", current_company: "Acme", current_designation: "Engineer", experience_years: 3, skills: ["JS"],
    };
    renderJobDetail();

    fireEvent.click((await screen.findAllByText("Apply Now"))[0]);

    await waitFor(() => expect(screen.getByText("Submit Application")).toBeInTheDocument());
    expect(toast.error).not.toHaveBeenCalled();
  });
});
