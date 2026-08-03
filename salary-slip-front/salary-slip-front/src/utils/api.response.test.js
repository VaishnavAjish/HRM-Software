import { describe, expect, it } from "vitest";

import { parseApiJsonResponse } from "./api";

describe("parseApiJsonResponse", () => {
  it("parses a normal JSON response", () => {
    expect(parseApiJsonResponse('{"data":{"id":1}}')).toEqual({
      data: { data: { id: 1 } },
      malformed: false,
    });
  });

  it("detects concatenated error documents without leaking a SyntaxError", () => {
    const result = parseApiJsonResponse(
      '{"message":"Token not provided"}\n{"message":"Server Error"}',
    );

    expect(result.malformed).toBe(true);
    expect(result.data).toEqual({ message: "Server Error" });
    expect(result.parseError).toBeInstanceOf(SyntaxError);
  });

  it("does not split braces embedded inside JSON strings", () => {
    const result = parseApiJsonResponse(
      '{"message":"value }{ inside string"}{"message":"Server Error"}',
    );

    expect(result.malformed).toBe(true);
    expect(result.data).toEqual({ message: "Server Error" });
  });

  it("marks truncated JSON as malformed", () => {
    const result = parseApiJsonResponse('{"message":"incomplete"');

    expect(result.malformed).toBe(true);
    expect(result.data).toBeNull();
  });
});
