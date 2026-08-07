import { io } from "socket.io-client";

const SOCKET_SERVER_URL = import.meta.env.VITE_SOCKET_URL || "http://192.168.1.53:8000";

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
