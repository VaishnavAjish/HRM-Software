import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The sign-out → sign-in-as-someone-else lifecycle, client side.
 *
 * This app holds a JWT in sessionStorage and sends it as an Authorization
 * header; there are no authentication cookies, so nothing expires on its own and
 * every trace of the signed-in user has to be removed deliberately.
 *
 * The leak these tests pin: the selected company and branch live in
 * localStorage under `active_company_scope` and were never cleared, so the next
 * person to sign in on the same machine inherited the previous user's data scope
 * and saw every list filtered by it.
 */

vi.mock("../utils/api", () => ({
  authApi: {
    getProfile: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  },
  rbacApi: { getMyPermissions: vi.fn() },
  // The enterprise snapshot is consulted first (session hydration runs it
  // in parallel with getProfile, and loadPermissionsForUser tries it before
  // falling back to rbacApi) — resolving `success: false` here exercises
  // exactly that fallback path, which is what every permissions assertion
  // in this file is written against.
  authorizationApi: { me: vi.fn(() => Promise.resolve({ success: false })) },
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import { AuthProvider, useAuth } from "./AuthContext";
import { authApi, rbacApi } from "../utils/api";
import { PRESERVED_LOCAL_KEYS } from "../utils/authSession";

const AUTH_KEY = "auth_user";
const SCOPE_KEY = "active_company_scope";

const userA = { id: 1, name: "User A", email: "a@test.local", role: 0, company_code: "nidhi-impex" };
const userB = { id: 2, name: "User B", email: "b@test.local", role: 1, company_code: "silver-star" };

/** A working in-memory Storage — jsdom's is not reliable in this build. */
function installStorage(name) {
  const data = new Map();

  Object.defineProperty(window, name, {
    configurable: true,
    writable: true,
    value: {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => data.set(String(k), String(v)),
      removeItem: (k) => data.delete(k),
      clear: () => data.clear(),
      key: (i) => [...data.keys()][i] ?? null,
      get length() {
        return data.size;
      },
    },
  });
}

function Harness() {
  const { user, login, logout, initializing } = useAuth();

  if (initializing) return <p>loading</p>;

  return (
    <div>
      <p data-testid="identity">{user ? user.email : "signed-out"}</p>
      <button onClick={() => login("b@test.local", "pw")}>sign in B</button>
      <button onClick={() => logout()}>sign out</button>
    </div>
  );
}

const renderApp = () => render(<AuthProvider><Harness /></AuthProvider>);

/** Put the app in the state of "User A is signed in". */
function signedInAsA() {
  window.sessionStorage.setItem(
    AUTH_KEY,
    JSON.stringify({ ...userA, accessToken: "token-a", tokenType: "bearer", rawRole: 0 }),
  );
  window.localStorage.setItem(SCOPE_KEY, "silver-star::Daduk");
  authApi.getProfile.mockResolvedValue({ user: userA });
}

beforeEach(() => {
  vi.clearAllMocks();
  installStorage("localStorage");
  installStorage("sessionStorage");
  rbacApi.getMyPermissions.mockResolvedValue({ status: true, data: [] });
  authApi.logout.mockResolvedValue({ status: true, message: "Logged out successfully" });
  authApi.login.mockResolvedValue({ status: true, token: "token-b", token_type: "Bearer", user: userB });
});

describe("Signing out", () => {
  it("revokes the session on the backend", async () => {
    signedInAsA();
    renderApp();
    await screen.findByText("a@test.local");

    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(authApi.logout).toHaveBeenCalledTimes(1));
    // The token is what the backend needs in order to blacklist it.
    expect(authApi.logout).toHaveBeenCalledWith("token-a", "bearer");
  });

  it("removes the token and the tenant scope from browser storage", async () => {
    signedInAsA();
    renderApp();
    await screen.findByText("a@test.local");

    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(window.sessionStorage.getItem(AUTH_KEY)).toBeNull());
    // The company/branch selection is the value that used to survive and get
    // inherited by the next person to sign in.
    expect(window.localStorage.getItem(SCOPE_KEY)).toBeNull();
  });

  it("keeps device preferences that are not tied to the person", async () => {
    signedInAsA();
    window.localStorage.setItem("theme", "dark");
    window.localStorage.setItem("salaryms_sidebar_collapsed", "true");

    renderApp();
    await screen.findByText("a@test.local");
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(window.sessionStorage.getItem(AUTH_KEY)).toBeNull());

    // Wiping these on a shared machine would be a regression, not security.
    PRESERVED_LOCAL_KEYS.forEach((key) => {
      expect(window.localStorage.getItem(key)).not.toBeNull();
    });
  });

  it("clears the session even when the backend call fails", async () => {
    signedInAsA();
    authApi.logout.mockRejectedValue(new Error("Network down"));

    renderApp();
    await screen.findByText("a@test.local");

    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));

    // Offline, or the server is down — the person must still be signed out of
    // this machine.
    await waitFor(() => expect(screen.getByTestId("identity")).toHaveTextContent("signed-out"));
    expect(window.sessionStorage.getItem(AUTH_KEY)).toBeNull();
    expect(window.localStorage.getItem(SCOPE_KEY)).toBeNull();
  });

  it("collapses a double sign-out onto one backend call", async () => {
    signedInAsA();
    renderApp();
    await screen.findByText("a@test.local");

    const button = screen.getByRole("button", { name: /sign out/i });
    await userEvent.click(button);
    await userEvent.click(button);

    await waitFor(() => expect(screen.getByTestId("identity")).toHaveTextContent("signed-out"));
    expect(authApi.logout).toHaveBeenCalledTimes(1);
  });

  it("empties the in-memory identity", async () => {
    signedInAsA();
    renderApp();
    await screen.findByText("a@test.local");

    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(screen.getByTestId("identity")).toHaveTextContent("signed-out"));
  });
});

describe("Signing in as somebody else", () => {
  it("drops the previous user's tenant scope before hydrating", async () => {
    signedInAsA();
    renderApp();
    await screen.findByText("a@test.local");

    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() => expect(screen.getByTestId("identity")).toHaveTextContent("signed-out"));

    // Something re-seeds the scope between sessions — a lingering write, or a
    // sign-in that never went through sign-out at all.
    window.localStorage.setItem(SCOPE_KEY, "silver-star::Daduk");

    await userEvent.click(screen.getByRole("button", { name: /sign in b/i }));

    await waitFor(() => expect(screen.getByTestId("identity")).toHaveTextContent("b@test.local"));
    expect(window.localStorage.getItem(SCOPE_KEY)).toBeNull();
  });

  it("shows only the new user's identity", async () => {
    signedInAsA();
    renderApp();
    await screen.findByText("a@test.local");

    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() => expect(screen.getByTestId("identity")).toHaveTextContent("signed-out"));

    await userEvent.click(screen.getByRole("button", { name: /sign in b/i }));

    await waitFor(() => expect(screen.getByTestId("identity")).toHaveTextContent("b@test.local"));
    expect(document.body.textContent).not.toContain("a@test.local");
    expect(window.sessionStorage.getItem(AUTH_KEY)).toContain("b@test.local");
  });

  it("reloads permissions for the new identity rather than reusing them", async () => {
    signedInAsA();
    renderApp();
    await screen.findByText("a@test.local");

    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() => expect(screen.getByTestId("identity")).toHaveTextContent("signed-out"));

    rbacApi.getMyPermissions.mockClear();
    await userEvent.click(screen.getByRole("button", { name: /sign in b/i }));

    await waitFor(() => expect(screen.getByTestId("identity")).toHaveTextContent("b@test.local"));
    // User B is role 1, so permissions are fetched from the backend rather than
    // carried over from whatever A had.
    expect(rbacApi.getMyPermissions).toHaveBeenCalledWith("token-b", "Bearer");
  });
});

describe("Session hydration on startup", () => {
  it("asks the backend who the user is rather than trusting storage", async () => {
    signedInAsA();
    renderApp();

    await screen.findByText("a@test.local");
    expect(authApi.getProfile).toHaveBeenCalledWith("token-a", "bearer");
  });

  it("clears a stored session the backend rejects", async () => {
    signedInAsA();
    authApi.getProfile.mockRejectedValue(new Error("401"));

    renderApp();

    // A token in storage is not proof of a session; the backend decides.
    await waitFor(() => expect(screen.getByTestId("identity")).toHaveTextContent("signed-out"));
    expect(window.sessionStorage.getItem(AUTH_KEY)).toBeNull();
    expect(window.localStorage.getItem(SCOPE_KEY)).toBeNull();
  });

  it("signs the tab out when a request comes back unauthorized", async () => {
    signedInAsA();
    renderApp();
    await screen.findByText("a@test.local");

    // utils/api dispatches this on any 401 from an authenticated request.
    window.dispatchEvent(new CustomEvent("auth:unauthorized"));

    await waitFor(() => expect(screen.getByTestId("identity")).toHaveTextContent("signed-out"));
    expect(window.localStorage.getItem(SCOPE_KEY)).toBeNull();
  });
});

describe("Multiple tabs", () => {
  it("signs this tab out when another tab signs out", async () => {
    signedInAsA();
    renderApp();
    await screen.findByText("a@test.local");

    // The other tab's broadcast. Only the event name travels — never a token.
    window.dispatchEvent(
      new StorageEvent("storage", { key: "auth-session:signed-out", newValue: String(Date.now()) }),
    );

    await waitFor(() => expect(screen.getByTestId("identity")).toHaveTextContent("signed-out"));
  });

  it("never puts a token in the broadcast", async () => {
    signedInAsA();
    const sent = [];
    const original = window.localStorage.setItem.bind(window.localStorage);
    window.localStorage.setItem = (k, v) => {
      sent.push(`${k}=${v}`);
      return original(k, v);
    };

    renderApp();
    await screen.findByText("a@test.local");
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(screen.getByTestId("identity")).toHaveTextContent("signed-out"));
    sent.forEach((entry) => expect(entry).not.toContain("token-a"));
  });
});
