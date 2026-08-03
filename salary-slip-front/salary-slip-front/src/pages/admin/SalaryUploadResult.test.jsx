import { describe, it, expect } from "vitest";

/**
 * How an upload result is reported.
 *
 * The page used to announce every outcome with toast.success and a fixed
 * "Skipped N due to missing fields" — so an upload that wrote nothing at all
 * appeared as a green tick reading "Uploaded 0 records", and the server's real
 * explanation ("Row 2: Missing employee code") was discarded in favour of a
 * cause that was usually wrong.
 *
 * This is the pure decision the handler makes, extracted so the outcome can be
 * asserted without standing up the whole upload page.
 */
function describeUploadResult({ imported = 0, skipped = [] } = {}) {
  const okCount = imported;
  const skipCount = skipped.length;

  const reasons = [
    ...new Set(
      skipped
        .map((entry) => String(entry).replace(/^Row\s+\d+:\s*/i, "").trim())
        .filter(Boolean),
    ),
  ];
  const detail = reasons.length ? ` — ${reasons.join("; ")}` : "";
  const rowWord = (n) => `${n} row${n === 1 ? "" : "s"}`;

  if (skipCount === 0) {
    return {
      severity: "success",
      message: `Successfully uploaded ${okCount} salary slip${okCount === 1 ? "" : "s"}.`,
    };
  }

  if (okCount === 0) {
    return {
      severity: "error",
      message: `No salary slips uploaded — ${rowWord(skipCount)} skipped${detail}`,
    };
  }

  return {
    severity: "warning",
    message: `Uploaded ${okCount}, skipped ${rowWord(skipCount)}${detail}`,
  };
}

describe("Upload result messaging", () => {
  it("reports a clean upload as a success", () => {
    const result = describeUploadResult({ imported: 12, skipped: [] });

    expect(result.severity).toBe("success");
    expect(result.message).toBe("Successfully uploaded 12 salary slips.");
  });

  it("does not call a total failure a success", () => {
    // The screenshot case: one row, rejected, nothing written.
    const result = describeUploadResult({
      imported: 0,
      skipped: ["Row 2: Missing employee code"],
    });

    expect(result.severity).toBe("error");
    expect(result.message).not.toMatch(/success/i);
    expect(result.message).toContain("No salary slips uploaded");
  });

  it("shows the reason the server actually gave", () => {
    const result = describeUploadResult({
      imported: 0,
      skipped: ["Row 2: Missing employee code"],
    });

    expect(result.message).toContain("Missing employee code");
    // The old text asserted a cause regardless of what went wrong.
    expect(result.message).not.toContain("missing fields");
  });

  it("reports a different cause accurately rather than guessing", () => {
    const result = describeUploadResult({
      imported: 0,
      skipped: ["Row 4: Unrecognized month value"],
    });

    expect(result.message).toContain("Unrecognized month value");
    expect(result.message).not.toContain("missing fields");
  });

  it("collapses repeated reasons instead of repeating them per row", () => {
    const result = describeUploadResult({
      imported: 0,
      skipped: [
        "Row 2: Missing employee code",
        "Row 3: Missing employee code",
        "Row 4: Missing employee code",
      ],
    });

    expect(result.message).toContain("3 rows skipped");
    expect(result.message.match(/Missing employee code/g)).toHaveLength(1);
  });

  it("lists distinct reasons when rows failed for different causes", () => {
    const result = describeUploadResult({
      imported: 0,
      skipped: ["Row 2: Missing employee code", "Row 5: Unrecognized month value"],
    });

    expect(result.message).toContain("Missing employee code");
    expect(result.message).toContain("Unrecognized month value");
  });

  it("flags a partial upload as a warning, not a success", () => {
    const result = describeUploadResult({
      imported: 8,
      skipped: ["Row 9: Missing employee code"],
    });

    expect(result.severity).toBe("warning");
    expect(result.message).toContain("Uploaded 8");
    expect(result.message).toContain("skipped 1 row");
  });

  it("keeps the row count singular for one row", () => {
    const result = describeUploadResult({
      imported: 0,
      skipped: ["Row 2: Missing employee code"],
    });

    expect(result.message).toContain("1 row skipped");
    expect(result.message).not.toContain("1 rows");
  });

  it("survives a server response with no explanation attached", () => {
    const result = describeUploadResult({ imported: 0, skipped: [""] });

    // Still reported as a failure; there is simply no cause to name, so the
    // message ends after the count rather than trailing an empty reason.
    expect(result.severity).toBe("error");
    expect(result.message).toBe("No salary slips uploaded — 1 row skipped");
  });
});
