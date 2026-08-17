import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { publicJobApi } from "./api";

/**
 * Regression coverage for a live bug: a job was published and visible in
 * the database, but the Career Portal always showed "0 open positions".
 *
 * Root cause: `CareersList.jsx` builds its filter object with the
 * `value || undefined` idiom to mean "no filter selected". But
 * `new URLSearchParams({ x: undefined })` stringifies to the literal
 * `x=undefined`, not an omitted key — so every page load (even with every
 * filter left on its default) sent `search=undefined&employment_type=
 * undefined&company_code=undefined`. The backend's `if ($request->
 * company_code)` treated the string "undefined" as a real filter value and
 * excluded every job, since none has `company_code === "undefined"`.
 */
describe("publicJobApi.getJobs", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: () => Promise.resolve('{"status":true,"data":[]}'),
    }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends no query string at all when every filter is left at its default (undefined)", async () => {
    await publicJobApi.getJobs({ search: undefined, employment_type: undefined, company_code: undefined });

    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).not.toContain("undefined");
    expect(url.endsWith("/api/public/jobs")).toBe(true);
  });

  it("omits null and empty-string filters the same way", async () => {
    await publicJobApi.getJobs({ search: "", employment_type: null, company_code: undefined });

    const [url] = globalThis.fetch.mock.calls[0];
    expect(url.endsWith("/api/public/jobs")).toBe(true);
  });

  it("still sends a real, explicitly chosen filter value", async () => {
    await publicJobApi.getJobs({ search: undefined, employment_type: "full_time", company_code: undefined });

    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain("employment_type=full_time");
    expect(url).not.toContain("undefined");
  });
});
