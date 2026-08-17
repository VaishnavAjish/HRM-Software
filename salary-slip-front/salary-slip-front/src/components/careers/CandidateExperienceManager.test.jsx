import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ token: "candidate-token" }));

vi.mock("../../context/CandidateAuthContext", () => ({
  useCandidateAuth: () => authState,
}));

const apiState = vi.hoisted(() => ({ experiences: [] }));

vi.mock("../../utils/api", () => ({
  candidateApi: {
    getExperiences: vi.fn(() => Promise.resolve({ status: true, data: apiState.experiences })),
    createExperience: vi.fn((payload) => Promise.resolve({ status: true, data: { id: 1, ...payload } })),
    updateExperience: vi.fn((id, payload) => Promise.resolve({ status: true, data: { id, ...payload } })),
    deleteExperience: vi.fn(() => Promise.resolve({ status: true })),
  },
}));

import CandidateExperienceManager from "./CandidateExperienceManager";
import { candidateApi } from "../../utils/api";

describe("CandidateExperienceManager", () => {
  beforeEach(() => {
    apiState.experiences = [];
    vi.clearAllMocks();
  });

  it("shows an honest empty state when nothing is saved", async () => {
    render(<CandidateExperienceManager />);
    expect(await screen.findByText("No experience added yet.")).toBeInTheDocument();
  });

  it("lists existing experience with formatted date ranges", async () => {
    apiState.experiences = [{
      id: 1, company: "Acme Corp", designation: "Software Engineer", location: "Surat",
      start_date: "2022-01-15", end_date: null, is_current: true, description: "",
    }];
    render(<CandidateExperienceManager />);

    expect(await screen.findByText("Software Engineer")).toBeInTheDocument();
    expect(screen.getByText(/Acme Corp/)).toBeInTheDocument();
    expect(screen.getByText(/Present/)).toBeInTheDocument();
  });

  it("adds a new experience entry", async () => {
    const user = userEvent.setup();
    render(<CandidateExperienceManager />);
    await screen.findByText("No experience added yet.");

    await user.click(screen.getByRole("button", { name: /add experience/i }));
    await user.type(screen.getByLabelText("Company *"), "Acme Corp");
    await user.type(screen.getByLabelText("Designation *"), "Software Engineer");
    await user.type(screen.getByLabelText("Start Date *"), "2022-01-15");
    await user.click(screen.getByLabelText("I currently work here"));
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(candidateApi.createExperience).toHaveBeenCalledWith(
      expect.objectContaining({ company: "Acme Corp", designation: "Software Engineer", is_current: true, end_date: null }),
      "candidate-token",
    ));
    expect(await screen.findByText("Software Engineer")).toBeInTheDocument();
  });

  it("removes an experience entry", async () => {
    apiState.experiences = [{
      id: 5, company: "Old Co", designation: "Intern", location: null,
      start_date: "2020-01-01", end_date: "2020-06-01", is_current: false, description: "",
    }];
    const user = userEvent.setup();
    render(<CandidateExperienceManager />);

    await screen.findByText("Intern");
    await user.click(screen.getByRole("button", { name: "Remove Intern" }));

    await waitFor(() => expect(candidateApi.deleteExperience).toHaveBeenCalledWith(5, "candidate-token"));
    expect(screen.queryByText("Intern")).not.toBeInTheDocument();
  });
});
