import { io } from "socket.io-client";

let socket = null;
const eventListeners = new Map();

/**
 * Initialize and return Socket.IO client instance
 */
export function getSocket(token) {
  const socketUrl = import.meta.env.VITE_SOCKET_URL;

  // Unless a dedicated Socket.IO server URL is explicitly provided in VITE_SOCKET_URL,
  // use the lightweight local event dispatcher to prevent 404 polling errors on Laravel API port 8000.
  if (!socketUrl) {
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
      socket = io(socketUrl, {
        autoConnect: true,
        reconnection: false,
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
