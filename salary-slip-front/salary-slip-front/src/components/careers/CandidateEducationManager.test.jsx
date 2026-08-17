import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ token: "candidate-token" }));

vi.mock("../../context/CandidateAuthContext", () => ({
  useCandidateAuth: () => authState,
}));

const apiState = vi.hoisted(() => ({ educations: [] }));

vi.mock("../../utils/api", () => ({
  candidateApi: {
    getEducations: vi.fn(() => Promise.resolve({ status: true, data: apiState.educations })),
    createEducation: vi.fn((payload) => Promise.resolve({ status: true, data: { id: 1, ...payload } })),
    updateEducation: vi.fn((id, payload) => Promise.resolve({ status: true, data: { id, ...payload } })),
    deleteEducation: vi.fn(() => Promise.resolve({ status: true })),
  },
}));

import CandidateEducationManager from "./CandidateEducationManager";
import { candidateApi } from "../../utils/api";

describe("CandidateEducationManager", () => {
  beforeEach(() => {
    apiState.educations = [];
    vi.clearAllMocks();
  });

  it("shows an honest empty state when nothing is saved", async () => {
    render(<CandidateEducationManager />);
    expect(await screen.findByText("No education added yet.")).toBeInTheDocument();
  });

  it("lists existing education", async () => {
    apiState.educations = [{
      id: 1, institution: "Gujarat University", degree: "B.Tech", field_of_study: "Computer Science",
      start_year: 2018, end_year: 2022, grade: "8.2 CGPA",
    }];
    render(<CandidateEducationManager />);

    expect(await screen.findByText("B.Tech, Computer Science")).toBeInTheDocument();
    expect(screen.getByText("Gujarat University")).toBeInTheDocument();
    expect(screen.getByText(/2018 — 2022/)).toBeInTheDocument();
  });

  it("adds a new education entry", async () => {
    const user = userEvent.setup();
    render(<CandidateEducationManager />);
    await screen.findByText("No education added yet.");

    await user.click(screen.getByRole("button", { name: /add education/i }));
    await user.type(screen.getByLabelText("Institution *"), "Gujarat University");
    await user.type(screen.getByLabelText("Degree *"), "B.Tech");
    await user.type(screen.getByLabelText("Start Year *"), "2018");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(candidateApi.createEducation).toHaveBeenCalledWith(
      expect.objectContaining({ institution: "Gujarat University", degree: "B.Tech" }),
      "candidate-token",
    ));
    expect(await screen.findByText("Gujarat University")).toBeInTheDocument();
  });

  it("removes an education entry", async () => {
    apiState.educations = [{ id: 9, institution: "XYZ School", degree: "High School", start_year: 2014, end_year: 2016 }];
    const user = userEvent.setup();
    render(<CandidateEducationManager />);

    await screen.findByText("XYZ School");
    await user.click(screen.getByRole("button", { name: "Remove High School" }));

    await waitFor(() => expect(candidateApi.deleteEducation).toHaveBeenCalledWith(9, "candidate-token"));
    expect(screen.queryByText("XYZ School")).not.toBeInTheDocument();
  });
});
