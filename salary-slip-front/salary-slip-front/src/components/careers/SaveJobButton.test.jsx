import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ isAuthenticated: true, token: "candidate-token" }));

vi.mock("../../context/CandidateAuthContext", () => ({
  useCandidateAuth: () => authState,
}));

vi.mock("../../utils/api", () => ({
  candidateApi: {
    saveJob: vi.fn(() => Promise.resolve({ status: true, data: { saved_job_id: 1 } })),
    unsaveJob: vi.fn(() => Promise.resolve({ status: true })),
  },
}));

import SaveJobButton from "./SaveJobButton";
import { candidateApi } from "../../utils/api";

function renderButton(props = {}) {
  return render(
    <MemoryRouter initialEntries={["/careers/jobs/42"]}>
      <Routes>
        <Route path="/careers/jobs/:id" element={<SaveJobButton jobId={42} {...props} />} />
        <Route path="/careers/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SaveJobButton", () => {
  beforeEach(() => {
    authState.isAuthenticated = true;
    vi.clearAllMocks();
  });

  it("saves an unsaved job when clicked", async () => {
    const user = userEvent.setup();
    renderButton({ initialSaved: false });

    await user.click(screen.getByRole("button", { name: "Save job" }));

    await waitFor(() => expect(candidateApi.saveJob).toHaveBeenCalledWith(42, "candidate-token"));
    expect(screen.getByRole("button", { name: "Remove from saved jobs" })).toBeInTheDocument();
  });

  it("unsaves an already-saved job when clicked", async () => {
    const user = userEvent.setup();
    renderButton({ initialSaved: true });

    await user.click(screen.getByRole("button", { name: "Remove from saved jobs" }));

    await waitFor(() => expect(candidateApi.unsaveJob).toHaveBeenCalledWith(42, "candidate-token"));
    expect(screen.getByRole("button", { name: "Save job" })).toBeInTheDocument();
  });

  it("redirects to login instead of calling the API when unauthenticated", async () => {
    authState.isAuthenticated = false;
    const user = userEvent.setup();
    renderButton({ initialSaved: false });

    await user.click(screen.getByRole("button", { name: "Save job" }));

    expect(await screen.findByText("Login Page")).toBeInTheDocument();
    expect(candidateApi.saveJob).not.toHaveBeenCalled();
  });
});
