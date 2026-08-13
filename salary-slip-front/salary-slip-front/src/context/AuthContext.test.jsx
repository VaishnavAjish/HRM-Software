import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

vi.mock("../utils/api", () => ({
  authApi: {
    getProfile: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  },
  authorizationApi: { me: vi.fn() },
  rbacApi: { getMyPermissions: vi.fn() },
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import { AuthProvider, useAuth } from "./AuthContext";
import { authApi, authorizationApi, rbacApi } from "../utils/api";

/**
 * The provider used to build its context value inline:
 *
 *   <AuthContext.Provider value={{ ... }}>
 *
 * so every render of whatever renders AuthProvider handed each consumer a brand
 * new object — and a new `user` reference with it. Any consumer effect that
 * depended on `user` re-ran on every one of those renders. In AppointmentModal
 * that effect also set state, so it re-rendered, re-ran, and fetched again:
 * an unbounded loop. These tests hold the provider value's identity in place.
 */

/** Records what the context handed the consumer on each render. */
function makeProbe() {
  const seen = [];

  function Probe() {
    const auth = useAuth();
    seen.push(auth);
    return <span data-testid="probe">{auth.user?.email || "anonymous"}</span>;
  }

  return { seen, Probe };
}

/** A parent whose own state changes without touching anything auth-related. */
function ParentWithLocalState({ children }) {
  const [tick, setTick] = useState(0);

  return (
    <>
      <button type="button" onClick={() => setTick((t) => t + 1)}>
        bump parent
      </button>
      <span data-testid="tick">{tick}</span>
      <AuthProvider>{children}</AuthProvider>
    </>
  );
}

const STORED_USER = {
  accessToken: "stored-token",
  tokenType: "bearer",
  email: "rohit@example.com",
  empCode: "EMP1025",
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  rbacApi.getMyPermissions.mockResolvedValue({ status: true, data: [] });
  authorizationApi.me.mockRejectedValue(new Error("snapshot unavailable"));
});

describe("AuthProvider — context value identity", () => {
  it("hands out the same value when the parent re-renders for its own reasons", async () => {
    const { seen, Probe } = makeProbe();

    render(
      <ParentWithLocalState>
        <Probe />
      </ParentWithLocalState>,
    );

    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    const before = seen[seen.length - 1];

    await userEvent.click(screen.getByRole("button", { name: /bump parent/i }));
    expect(screen.getByTestId("tick")).toHaveTextContent("1");

    // Nothing auth-related changed, so the consumer must see the very same
    // object — this is what stops consumer effects from re-firing.
    expect(seen[seen.length - 1]).toBe(before);
  });

  it("keeps login, logout and the user-list helpers stable across those renders", async () => {
    const { seen, Probe } = makeProbe();

    render(
      <ParentWithLocalState>
        <Probe />
      </ParentWithLocalState>,
    );

    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    const before = seen[seen.length - 1];

    await userEvent.click(screen.getByRole("button", { name: /bump parent/i }));
    const after = seen[seen.length - 1];

    expect(after.login).toBe(before.login);
    expect(after.logout).toBe(before.logout);
    expect(after.addUser).toBe(before.addUser);
    expect(after.removeUser).toBe(before.removeUser);
    expect(after.lookupUser).toBe(before.lookupUser);
  });

  it("still gives the consumer a new value when the user actually changes", async () => {
    authApi.login.mockResolvedValue({
      access_token: "fresh-token",
      token_type: "bearer",
      data: { id: 7, email: "new@example.com", role: 1, name: "New" },
    });

    const { seen, Probe } = makeProbe();

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    const before = seen[seen.length - 1];
    expect(before.isAuthenticated).toBe(false);

    await act(async () => {
      await before.login("new@example.com", "pw", "nidhi-impex");
    });

    const after = seen[seen.length - 1];
    expect(after).not.toBe(before);
    expect(after.user?.email).toBe("new@example.com");
    expect(after.isAuthenticated).toBe(true);
    expect(await screen.findByTestId("probe")).toHaveTextContent("new@example.com");
  });

  it("uses the authorization snapshot to place a custom tier-3 user in the management shell", async () => {
    authApi.login.mockResolvedValue({
      access_token: "custom-token",
      token_type: "bearer",
      data: { id: 9, email: "custom@example.com", role: 3, name: "Custom" },
    });
    authorizationApi.me.mockResolvedValue({
      success: true,
      data: {
        portal: "admin",
        permissions: {
          "ui.portals.business": { allowed: true, state: "ALLOW" },
          "ui.salary": { allowed: true, state: "ALLOW" },
        },
        routes: { "/admin/salary": "ui.salary" },
        requires: {},
        roles: [{ code: "accounts_operator", name: "Accounts Operator" }],
        featureFlags: {},
      },
    });

    const { seen, Probe } = makeProbe();
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));

    await act(async () => {
      await seen[seen.length - 1].login("custom@example.com", "pw", "nidhi-impex");
    });

    const current = seen[seen.length - 1].user;
    expect(current.role).toBe("admin");
    expect(current.rawRole).toBe(3);
    expect(current.permissions["ui.salary"]).toBe("read_write");
    expect(current.authorization.routes["/admin/salary"]).toBe("ui.salary");
  });

  it("re-issues the value when permissions change on the user", async () => {
    sessionStorage.setItem("auth_user", JSON.stringify(STORED_USER));
    authApi.getProfile.mockResolvedValue({
      data: { id: 3, email: "rohit@example.com", role: 1, name: "Rohit" },
    });
    rbacApi.getMyPermissions.mockResolvedValue({
      status: true,
      data: [{ key_name: "appointments", value: "read_write" }],
    });

    const { seen, Probe } = makeProbe();

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(seen[seen.length - 1].user?.permissions).toBeDefined());
    expect(seen[seen.length - 1].user.permissions).toEqual({
      appointments: "read_write",
    });
  });

  it("clears the session on logout and reports it", async () => {
    sessionStorage.setItem("auth_user", JSON.stringify(STORED_USER));
    authApi.getProfile.mockResolvedValue({
      data: { id: 3, email: "rohit@example.com", role: 1, name: "Rohit" },
    });
    authApi.logout.mockResolvedValue({ message: "Logged out successfully" });

    const { seen, Probe } = makeProbe();

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(seen[seen.length - 1].isAuthenticated).toBe(true));

    let result;
    await act(async () => {
      result = await seen[seen.length - 1].logout();
    });

    expect(result.success).toBe(true);
    expect(authApi.logout).toHaveBeenCalledWith("stored-token", "bearer");
    await waitFor(() => expect(seen[seen.length - 1].isAuthenticated).toBe(false));
    expect(sessionStorage.getItem("auth_user")).toBeNull();
  });

  it("finishes initialising when there is no stored session", async () => {
    const { seen, Probe } = makeProbe();

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(seen[seen.length - 1].initializing).toBe(false));
    expect(seen[seen.length - 1].user).toBeNull();
    expect(authApi.getProfile).not.toHaveBeenCalled();
  });

  it("updates the current user without replacing the callbacks that did not change", async () => {
    sessionStorage.setItem("auth_user", JSON.stringify(STORED_USER));
    authApi.getProfile.mockResolvedValue({
      data: { id: 3, email: "rohit@example.com", role: 1, name: "Rohit" },
    });

    const { seen, Probe } = makeProbe();

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(seen[seen.length - 1].isAuthenticated).toBe(true));
    const before = seen[seen.length - 1];

    await act(async () => {
      before.updateCurrentUser({ name: "Rohit Saket" });
    });

    const after = seen[seen.length - 1];
    expect(after.user.name).toBe("Rohit Saket");
    // The token did not change, so logout keeps its identity.
    expect(after.logout).toBe(before.logout);
    expect(after.login).toBe(before.login);
  });
});
