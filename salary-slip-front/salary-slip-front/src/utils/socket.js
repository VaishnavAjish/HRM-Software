import { io } from "socket.io-client";

const SOCKET_PORT = 8000;

function defaultSocketUrl() {
  const api = import.meta.env.VITE_API_BASE_URL;

  if (api) {
    try {
      return new URL(api, window.location.origin).origin;
    } catch {
      // Malformed value
    }
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:${SOCKET_PORT}`;
  }

  return "";
}

const SOCKET_SERVER_URL = import.meta.env.VITE_SOCKET_URL || defaultSocketUrl();

let socket = null;
const eventListeners = new Map();

/**
 * Initialize and return Socket.IO client instance
 */
export function getSocket(token) {
  // On production domains (like niss.pro) without explicit socket server URL, fall back gracefully to local event dispatcher
  const isNonLocalHostWithoutSocketUrl =
    typeof window !== "undefined" &&
    (window.location.hostname === "niss.pro" ||
      (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1")) &&
    !import.meta.env.VITE_SOCKET_URL;

  if (isNonLocalHostWithoutSocketUrl) {
    return {
      on: (event, fn) => {
        if (!eventListeners.has(event)) eventListeners.set(event, new Set());
        eventListeners.get(event).add(fn);
      },
      off: (event, fn) => {
        if (eventListeners.has(event)) eventListeners.get(event).delete(fn);
      },
      emit: (event, data) => {
        if (eventListeners.has(event)) eventListeners.get(event).forEach((cb) => cb(data));
      },
      connected: false,
    };
  }

  if (!socket) {
    try {
      socket = io(SOCKET_SERVER_URL, {
        autoConnect: true,
        reconnection: false, // Don't spam console with retry attempts if server is offline
        transports: ["polling", "websocket"],
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
    } catch (e) {
      console.warn("[Socket.IO] Disabled:", e.message);
    }
  }

  return socket;
}

/**
 * Subscribe to a Socket.IO or local event channel
 */
export function subscribeSocketEvent(eventName, callback) {
  if (!eventListeners.has(eventName)) {
    eventListeners.set(eventName, new Set());
  }
  eventListeners.get(eventName).add(callback);

  const s = getSocket();
  if (s && typeof s.on === "function") {
    s.on(eventName, callback);
  }

  return () => {
    if (s && typeof s.off === "function") {
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
  if (s && s.connected && typeof s.emit === "function") {
    s.emit(eventName, payload);
  }

  // Always trigger local eventListeners for instant reactive client dispatch
  if (eventListeners.has(eventName)) {
    eventListeners.get(eventName).forEach((cb) => cb(payload));
  }
}
