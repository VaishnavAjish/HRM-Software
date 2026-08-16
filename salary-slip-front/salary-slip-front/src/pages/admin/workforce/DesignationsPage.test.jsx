import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression test for a crash found via the HR Organization workspace's
// Designations tab: DesignationsPage used `useNavigate()` without importing
// it (ReferenceError on mount), and its create/edit Save handlers referenced
// a `form` variable that only ever existed inside the form components' own
// local state, so Save would throw as soon as it was clicked.

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ user: { accessToken: "token", tokenType: "Bearer" } }),
}));

vi.mock("../../../hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true }),
}));

const apiState = vi.hoisted(() => ({ rows: [] }));

vi.mock("../../../features/workforce/services/workforceApi", () => ({
  designationApi: {
    list: vi.fn(() => Promise.resolve({ data: { data: apiState.rows, total: apiState.rows.length } })),
    create: vi.fn(() => Promise.resolve({ data: { id: 99 } })),
    update: vi.fn(() => Promise.resolve({ data: { id: 1 } })),
    delete: vi.fn(() => Promise.resolve({})),
  },
}));

import DesignationsPage from "./DesignationsPage";
import { designationApi } from "../../../features/workforce/services/workforceApi";

describe("DesignationsPage", () => {
  beforeEach(() => {
    apiState.rows = [];
    vi.clearAllMocks();
  });

  it("mounts without throwing (no missing useNavigate import)", async () => {
    render(<DesignationsPage />);
    expect(await screen.findByText(/no designations found/i)).toBeInTheDocument();
  });

  it("creates a designation with the values typed into the create form", async () => {
    const user = userEvent.setup();
    render(<DesignationsPage />);

    await screen.findByText(/no designations found/i);
    await user.click(screen.getByRole("button", { name: /add designation/i }));

    await user.type(screen.getByLabelText(/title \*/i), "Marketing Lead");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(designationApi.create).toHaveBeenCalledTimes(1));
    expect(designationApi.create.mock.calls[0][0]).toMatchObject({ title: "Marketing Lead" });
  });

  it("edits a designation with the values from the edit form, not a bare `form` reference", async () => {
    apiState.rows = [{ id: 1, code: "mkt-lead", title: "Marketing Lead", status: "active" }];
    const user = userEvent.setup();
    render(<DesignationsPage />);

    await screen.findByText("Marketing Lead");
    await user.click(screen.getByTitle("Edit"));

    const titleInput = await screen.findByLabelText(/title \*/i);
    await user.clear(titleInput);
    await user.type(titleInput, "Senior Marketing Lead");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(designationApi.update).toHaveBeenCalledTimes(1));
    expect(designationApi.update.mock.calls[0][1]).toMatchObject({ title: "Senior Marketing Lead" });
  });
});
