import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression coverage for a live crash: this component called nine
// `hrApi.*` functions (tags/notes/communications) that were never
// implemented in utils/api.js, so opening any candidate's drawer threw a
// TypeError synchronously inside a useEffect. These tests exercise the
// full load -> render -> mutate cycle against the now-implemented client,
// so a future regression (removing a method, changing its signature) fails
// here instead of silently breaking every drawer open again.

vi.mock("../../../../context/AuthContext", () => ({
  useAuth: () => ({ user: { accessToken: "token", tokenType: "Bearer" } }),
}));

const authState = vi.hoisted(() => ({ allowed: new Set(["hr.candidate.tag", "hr.candidate.note", "hr.candidate.communication", "hr.candidate.update"]) }));

vi.mock("../../../../hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: (code) => authState.allowed.has(code) }),
}));

const apiState = vi.hoisted(() => ({
  allTags: [{ id: 1, name: "Priority", color: "#f97316" }],
  candidateTags: [],
  notes: [],
  comms: [],
  docs: [],
}));

vi.mock("../../../../utils/api", () => ({
  hrApi: {
    getCandidateTags: vi.fn(() => Promise.resolve({ status: true, data: apiState.allTags })),
    getCandidateTagsOf: vi.fn(() => Promise.resolve({ status: true, data: apiState.candidateTags })),
    storeCandidateTag: vi.fn(() => Promise.resolve({ status: true, data: { id: 2, name: "New Tag", color: "#6366f1" } })),
    syncCandidateTags: vi.fn(() => Promise.resolve({ status: true, data: [{ id: 1, name: "Priority", color: "#f97316" }] })),
    getCandidateNotes: vi.fn(() => Promise.resolve({ status: true, data: apiState.notes })),
    storeCandidateNote: vi.fn(() => Promise.resolve({ status: true, data: { id: 5, note: "Strong candidate", created_by: { name: "Recruiter" }, created_at: "2026-08-17T10:00:00Z" } })),
    deleteCandidateNote: vi.fn(() => Promise.resolve({ status: true })),
    getCandidateCommunications: vi.fn(() => Promise.resolve({ status: true, data: apiState.comms })),
    storeCandidateCommunication: vi.fn(() => Promise.resolve({ status: true, data: { id: 9, type: "email", subject: "Interview", body: "Please confirm", status: "sent", created_at: "2026-08-17T10:00:00Z" } })),
    getCandidateDocuments: vi.fn(() => Promise.resolve({ status: true, data: apiState.docs })),
    uploadCandidateDocument: vi.fn(),
    deleteCandidateDocument: vi.fn(),
    reviewCandidateDocument: vi.fn(),
  },
  rbacApi: {
    getSettings: vi.fn(() => Promise.resolve({ status: true, data: [] })),
  },
}));

import CandidateCrmSections from "./CandidateCrmSections";
import { hrApi } from "../../../../utils/api";

describe("CandidateCrmSections", () => {
  beforeEach(() => {
    apiState.candidateTags = [];
    apiState.notes = [];
    apiState.comms = [];
    apiState.docs = [];
    authState.allowed = new Set(["hr.candidate.tag", "hr.candidate.note", "hr.candidate.communication", "hr.candidate.update"]);
    vi.clearAllMocks();
  });

  it("loads tags, notes, communications, and documents without throwing on drawer open", async () => {
    render(<CandidateCrmSections candidate={{ id: 42 }} loading={false} />);

    await waitFor(() => {
      expect(hrApi.getCandidateTags).toHaveBeenCalledWith("token", "Bearer");
      expect(hrApi.getCandidateTagsOf).toHaveBeenCalledWith(42, "token", "Bearer");
      expect(hrApi.getCandidateNotes).toHaveBeenCalledWith(42, "token", "Bearer");
      expect(hrApi.getCandidateCommunications).toHaveBeenCalledWith(42, "token", "Bearer");
      expect(hrApi.getCandidateDocuments).toHaveBeenCalledWith(42, "token", "Bearer");
    });
  });

  it("shows honest empty states when nothing has been loaded", async () => {
    render(<CandidateCrmSections candidate={{ id: 42 }} loading={false} />);

    expect(await screen.findByText("No tags yet")).toBeInTheDocument();
    expect(screen.getByText("No notes yet")).toBeInTheDocument();
    expect(screen.getByText("No communication logged")).toBeInTheDocument();
    expect(screen.getByText("No documents uploaded")).toBeInTheDocument();
  });

  it("adds a note and renders it", async () => {
    const user = userEvent.setup();
    render(<CandidateCrmSections candidate={{ id: 42 }} loading={false} />);
    await screen.findByText("No notes yet");

    await user.type(screen.getByPlaceholderText("Add a private note…"), "Strong candidate");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(hrApi.storeCandidateNote).toHaveBeenCalledWith(42, { note: "Strong candidate" }, "token", "Bearer"));
    expect(await screen.findByText("Strong candidate")).toBeInTheDocument();
  });

  it("deletes a note", async () => {
    apiState.notes = [{ id: 5, note: "Old note", created_by: { name: "Recruiter" }, created_at: "2026-08-17T10:00:00Z" }];
    const user = userEvent.setup();
    render(<CandidateCrmSections candidate={{ id: 42 }} loading={false} />);

    await screen.findByText("Old note");
    await user.click(screen.getByTitle("Delete note"));

    await waitFor(() => expect(hrApi.deleteCandidateNote).toHaveBeenCalledWith(5, "token", "Bearer"));
    await waitFor(() => expect(screen.queryByText("Old note")).not.toBeInTheDocument());
  });

  it("syncs tags when an existing tag is selected from the dropdown", async () => {
    const user = userEvent.setup();
    render(<CandidateCrmSections candidate={{ id: 42 }} loading={false} />);
    await screen.findByText("No tags yet");

    await user.selectOptions(screen.getByDisplayValue("Add tag…"), "1");

    await waitFor(() => expect(hrApi.syncCandidateTags).toHaveBeenCalledWith(42, [1], "token", "Bearer"));
  });

  it("sends a communication and appends it to the log", async () => {
    const user = userEvent.setup();
    render(<CandidateCrmSections candidate={{ id: 42 }} loading={false} />);
    await screen.findByText("No communication logged");

    await user.type(screen.getByPlaceholderText("Message body…"), "Please confirm");
    await user.click(screen.getByRole("button", { name: /send email/i }));

    await waitFor(() => expect(hrApi.storeCandidateCommunication).toHaveBeenCalledWith(
      42, { type: "email", subject: "", body: "Please confirm" }, "token", "Bearer",
    ));
    expect(await screen.findByText("Please confirm")).toBeInTheDocument();
  });

  it("hides every write control when the actor holds none of the CRM permissions", async () => {
    authState.allowed = new Set();
    render(<CandidateCrmSections candidate={{ id: 42 }} loading={false} />);
    await screen.findByText("No tags yet");

    expect(screen.queryByPlaceholderText("Add a private note…")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Message body…")).not.toBeInTheDocument();
    expect(screen.queryByText("Add tag…")).not.toBeInTheDocument();
  });

  it("does not crash the drawer when a load call fails", async () => {
    hrApi.getCandidateNotes.mockImplementationOnce(() => Promise.reject(new Error("Server error")));
    render(<CandidateCrmSections candidate={{ id: 42 }} loading={false} />);

    // Sibling sections still resolve even though notes failed.
    expect(await screen.findByText("No tags yet")).toBeInTheDocument();
  });
});
