import { io } from "socket.io-client";

const SOCKET_PORT = 8000;

/*
 * Derived, never hardcoded.
 *
 * This used to fall back to a literal LAN address. When the machine's DHCP
 * lease moved, that address stopped resolving and every socket attempt timed
 * out against a host that no longer existed — the same stale-IP failure that
 * took the login endpoint down with it. Following the API origin, and then the
 * host that actually served the page, means the client tracks wherever the
 * application is really running.
 */
function defaultSocketUrl() {
  const api = import.meta.env.VITE_API_BASE_URL;

  if (api) {
    try {
      return new URL(api, window.location.origin).origin;
    } catch {
      // Malformed value: fall through to the page's own host.
    }
  }

  return `${window.location.protocol}//${window.location.hostname}:${SOCKET_PORT}`;
}

const SOCKET_SERVER_URL = import.meta.env.VITE_SOCKET_URL || defaultSocketUrl();

let socket = null;
const eventListeners = new Map();

/**
 * Initialize and return Socket.IO client instance
 */
export function getSocket(token) {
  if (!socket) {
    socket = io(SOCKET_SERVER_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      transports: ["websocket", "polling"],
      auth: {
        token: token || "",
      },
    });

    socket.on("connect", () => {
      console.log("[Socket.IO] Connected to notification server:", socket.id);
    });

    socket.on("connect_error", (err) => {
      console.warn("[Socket.IO] Connection error (using fallback local event dispatcher):", err.message);
    });

    socket.on("disconnect", (reason) => {
      console.log("[Socket.IO] Disconnected:", reason);
    });
  }

  return socket;
}

/**
 * Subscribe to a Socket.IO event channel
 */
export function subscribeSocketEvent(eventName, callback) {
  const s = getSocket();
  if (s) {
    s.on(eventName, callback);

    if (!eventListeners.has(eventName)) {
      eventListeners.set(eventName, new Set());
    }
    eventListeners.get(eventName).add(callback);
  }

  return () => {
    if (s) {
      s.off(eventName, callback);
    }
    if (eventListeners.has(eventName)) {
      eventListeners.get(eventName).delete(callback);
    }
  };
}

/**
 * Emit a local or server Socket.IO notification event
 */
export function emitSocketEvent(eventName, payload) {
  const s = getSocket();
  if (s && s.connected) {
    s.emit(eventName, payload);
  }

  // Also trigger local eventListeners for instant reactive client dispatch
  if (eventListeners.has(eventName)) {
    eventListeners.get(eventName).forEach((cb) => cb(payload));
  }
}
