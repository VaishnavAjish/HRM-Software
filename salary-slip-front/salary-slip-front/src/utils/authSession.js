/**
 * Client-side session lifecycle.
 *
 * This app authenticates with a stateless JWT held in sessionStorage and sent as
 * an Authorization header — there are no authentication cookies, so there is
 * nothing for the browser to expire on its own. Everything that identifies the
 * signed-in user has to be removed deliberately, and every place that ends a
 * session has to remove the same set. That is what this module is for: one list,
 * used by sign-out, by the 401 handler, and by sign-in before it hydrates a new
 * identity.
 */

/** Per-tab. Holds the bearer token and the cached profile. */
const SESSION_KEYS = ["auth_user"];

/**
 * Shared across tabs, and the reason a new sign-in used to inherit the previous
 * user's company and branch: the scope is stored here and read once at startup.
 */
const LOCAL_KEYS = ["active_company_scope"];

/**
 * Deliberately preserved. These describe the device, not the person, and wiping
 * them on sign-out would reset a shared machine's appearance for no benefit —
 * which is why this module enumerates keys instead of calling clear().
 */
export const PRESERVED_LOCAL_KEYS = ["theme", "salaryms_sidebar_collapsed"];

const CHANNEL_NAME = "auth-session";

/** Safe, non-secret event names. A token must never be broadcast. */
export const SESSION_EVENT = {
  SIGNED_OUT: "signed-out",
};

function removeKeys(storage, keys) {
  keys.forEach((key) => {
    try {
      storage.removeItem(key);
    } catch {
      // Storage can be unavailable (private mode, disabled cookies). Sign-out
      // must not fail because of it.
    }
  });
}

/**
 * Remove every trace of the signed-in identity from browser storage.
 *
 * Called on sign-out, on a 401, and at the start of a sign-in — the last of
 * those so a new user cannot pick up state the previous one left behind.
 */
export function clearStoredSession() {
  try {
    removeKeys(window.sessionStorage, SESSION_KEYS);
  } catch {
    // Ignore: nothing to clear if the store is unreachable.
  }

  try {
    removeKeys(window.localStorage, LOCAL_KEYS);
  } catch {
    // Ignore.
  }
}

/**
 * Tell other tabs the session has ended.
 *
 * The token lives in sessionStorage, so each tab holds its own copy and would
 * otherwise keep rendering a signed-in UI until its next request happened to
 * come back 401. Only the event name travels — never the token.
 */
export function broadcastSignOut() {
  try {
    if (typeof BroadcastChannel === "function") {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage({ type: SESSION_EVENT.SIGNED_OUT });
      channel.close();
      return;
    }
  } catch {
    // Fall through to the storage-event path below.
  }

  try {
    // Fallback for browsers without BroadcastChannel: a write to localStorage
    // fires a storage event in every *other* tab. The value is a timestamp only,
    // so repeated sign-outs still produce a change worth reacting to.
    window.localStorage.setItem(`${CHANNEL_NAME}:${SESSION_EVENT.SIGNED_OUT}`, String(Date.now()));
  } catch {
    // Cross-tab sync is a convenience; its absence must not break sign-out.
  }
}

/**
 * React to another tab signing out. Returns an unsubscribe function.
 */
export function subscribeToSignOut(onSignedOut) {
  const cleanups = [];

  try {
    if (typeof BroadcastChannel === "function") {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (event?.data?.type === SESSION_EVENT.SIGNED_OUT) onSignedOut();
      };
      cleanups.push(() => channel.close());
    }
  } catch {
    // Ignore and rely on the storage listener below.
  }

  const onStorage = (event) => {
    if (event.key === `${CHANNEL_NAME}:${SESSION_EVENT.SIGNED_OUT}`) onSignedOut();
  };

  window.addEventListener("storage", onStorage);
  cleanups.push(() => window.removeEventListener("storage", onStorage));

  return () => cleanups.forEach((fn) => fn());
}
