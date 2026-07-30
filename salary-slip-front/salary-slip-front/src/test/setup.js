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

// Photo preview uses these; jsdom has no blob URL support.
URL.createObjectURL ||= vi.fn(() => "blob:mock");
URL.revokeObjectURL ||= vi.fn();
