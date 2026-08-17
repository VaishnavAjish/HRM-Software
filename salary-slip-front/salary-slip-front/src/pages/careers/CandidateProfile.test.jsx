import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression coverage for a real gap: `candidateApi.updateProfile` existed
// and was fully wired in the API client, but no page in the Career Portal
// ever called it — candidates had no way to edit their profile at all.

const authState = vi.hoisted(() => ({
  candidate: {
    name: "Jane Candidate", email: "jane@example.com", phone: "",
    current_company: "", current_designation: "", experience_years: "", skills: [],
    email_verified_at: "2026-08-17T10:00:00Z",
  },
  token: "candidate-token",
  setCandidate: vi.fn(),
}));

vi.mock("../../context/CandidateAuthContext", () => ({
  useCandidateAuth: () => authState,
}));

vi.mock("../../utils/api", () => ({
  candidateApi: {
    updateProfile: vi.fn(() => Promise.resolve({
      status: true,
      candidate: { ...authState.candidate, current_company: "Acme Corp" },
    })),
    getExperiences: vi.fn(() => Promise.resolve({ status: true, data: [] })),
    getEducations: vi.fn(() => Promise.resolve({ status: true, data: [] })),
  },
}));

import CandidateProfile from "./CandidateProfile";
import { candidateApi } from "../../utils/api";

function renderProfile() {
  return render(
    <MemoryRouter>
      <CandidateProfile />
    </MemoryRouter>,
  );
}

describe("CandidateProfile", () => {
  beforeEach(() => {
    authState.candidate = {
      name: "Jane Candidate", email: "jane@example.com", phone: "",
      current_company: "", current_designation: "", experience_years: "", skills: [],
      email_verified_at: "2026-08-17T10:00:00Z",
    };
    vi.clearAllMocks();
  });

  it("prompts sign in when no candidate is authenticated", () => {
    authState.candidate = null;
    renderProfile();
    expect(screen.getByText("Sign in to view your profile")).toBeInTheDocument();
  });

  it("pre-fills the form from the current candidate", () => {
    renderProfile();
    expect(screen.getByDisplayValue("Jane Candidate")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
  });

  it("shows 0% completion when only the name is present, and adds a skill", async () => {
    const user = userEvent.setup();
    renderProfile();
    expect(screen.getByText("17%")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Add a skill and press Enter"), "React{Enter}");
    expect(screen.getByText("React")).toBeInTheDocument();
  });

  it("submits edited fields via updateProfile", async () => {
    const user = userEvent.setup();
    renderProfile();

    await user.type(screen.getByLabelText(/Current Company/i), "Acme Corp");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(candidateApi.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ current_company: "Acme Corp", name: "Jane Candidate" }),
      "candidate-token",
    ));
    expect(authState.setCandidate).toHaveBeenCalled();
  });
});
