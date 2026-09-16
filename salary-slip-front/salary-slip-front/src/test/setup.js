import "@testing-library/jest-dom";
import { vi } from "vitest";

// jsdom implements none of these, and components under test touch all of them.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
}

globalThis.ResizeObserver ||= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

globalThis.IntersectionObserver ||= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function createMemoryStorage() {
  const entries = new Map();
  return {
    get length() { return entries.size; },
    key: (index) => Array.from(entries.keys())[index] ?? null,
    getItem: (name) => (entries.has(String(name)) ? entries.get(String(name)) : null),
    setItem: (name, value) => { entries.set(String(name), String(value)); },
    removeItem: (name) => { entries.delete(String(name)); },
    clear: () => { entries.clear(); },
  };
}

function storageIsUsable(name) {
  try {
    return typeof window[name]?.getItem === "function";
  } catch {
    return false;
  }
}

for (const name of ["localStorage", "sessionStorage"]) {
  if (!storageIsUsable(name)) {
    const storage = createMemoryStorage();
    Object.defineProperty(window, name, { configurable: true, value: storage });
    Object.defineProperty(globalThis, name, { configurable: true, value: storage });
  }
}

// Photo preview uses these; jsdom has no blob URL support.
URL.createObjectURL ||= vi.fn(() => "blob:mock");
URL.revokeObjectURL ||= vi.fn();
