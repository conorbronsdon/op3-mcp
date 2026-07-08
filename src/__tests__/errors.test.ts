import { describe, it, expect } from "vitest";
import {
  OP3APIError,
  AuthError,
  RateLimitError,
  NotFoundError,
  ValidationError,
  ServerError,
  mapHttpStatusToError,
  extractErrorDetail,
} from "../errors.js";

describe("typed error hierarchy", () => {
  it("every subclass extends OP3APIError, which extends Error", () => {
    expect(new AuthError("/x")).toBeInstanceOf(OP3APIError);
    expect(new RateLimitError("/x")).toBeInstanceOf(OP3APIError);
    expect(new NotFoundError("/x", "abc")).toBeInstanceOf(OP3APIError);
    expect(new ValidationError("/x", "bad param")).toBeInstanceOf(OP3APIError);
    expect(new ServerError("/x", "boom")).toBeInstanceOf(OP3APIError);
    expect(new OP3APIError(0, "generic", "/x")).toBeInstanceOf(Error);
  });

  it("each subclass sets a distinct .name", () => {
    expect(new AuthError("/x").name).toBe("AuthError");
    expect(new RateLimitError("/x").name).toBe("RateLimitError");
    expect(new NotFoundError("/x", "abc").name).toBe("NotFoundError");
    expect(new ValidationError("/x", "bad").name).toBe("ValidationError");
    expect(new ServerError("/x", "boom").name).toBe("ServerError");
    expect(new OP3APIError(0, "generic", "/x").name).toBe("OP3APIError");
  });

  it("carries the status code on .statusCode", () => {
    expect(new AuthError("/x").statusCode).toBe(401);
    expect(new RateLimitError("/x").statusCode).toBe(429);
    expect(new NotFoundError("/x", "abc").statusCode).toBe(404);
    expect(new ValidationError("/x", "bad").statusCode).toBe(400);
    expect(new ServerError("/x", "boom").statusCode).toBe(500);
  });

  it("ServerError defaults to status 500 but accepts a specific 5xx", () => {
    expect(new ServerError("/x", "boom").statusCode).toBe(500);
    expect(new ServerError("/x", "bad gateway", 502).statusCode).toBe(502);
    expect(new ServerError("/x", "bad gateway", 502).message).toContain("502");
  });

  it("carries the endpoint", () => {
    expect(new ValidationError("/queries/show-download-counts", "bad").endpoint).toBe(
      "/queries/show-download-counts",
    );
  });
});

describe("mapHttpStatusToError", () => {
  it("maps 401 and 403 to AuthError", () => {
    expect(mapHttpStatusToError(401, "bad token", "/x")).toBeInstanceOf(AuthError);
    expect(mapHttpStatusToError(403, "forbidden", "/x")).toBeInstanceOf(AuthError);
  });

  it("maps 429 to RateLimitError", () => {
    expect(mapHttpStatusToError(429, "slow down", "/x")).toBeInstanceOf(RateLimitError);
  });

  it("maps 404 to NotFoundError, using the identifier when given", () => {
    const err = mapHttpStatusToError(404, "missing", "/shows/abc", "abc");
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.message).toContain('"abc"');
  });

  it("maps 404 to NotFoundError, falling back to endpoint when no identifier given", () => {
    const err = mapHttpStatusToError(404, "missing", "/shows/abc");
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.message).toContain('"/shows/abc"');
  });

  it("maps 400 to ValidationError", () => {
    const err = mapHttpStatusToError(400, "missing show_uuid", "/x");
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.message).toContain("missing show_uuid");
  });

  it("maps 500-599 to ServerError, preserving the specific status", () => {
    expect(mapHttpStatusToError(500, "boom", "/x")).toBeInstanceOf(ServerError);
    expect(mapHttpStatusToError(502, "bad gateway", "/x")).toBeInstanceOf(ServerError);
    expect(mapHttpStatusToError(503, "unavailable", "/x")).toBeInstanceOf(ServerError);
    const err = mapHttpStatusToError(502, "bad gateway", "/x");
    expect(err.statusCode).toBe(502);
    expect(err.message).toContain("bad gateway");
  });

  it("falls back to base OP3APIError for unmapped status codes", () => {
    const err = mapHttpStatusToError(418, "teapot", "/x");
    expect(err).toBeInstanceOf(OP3APIError);
    expect(err).not.toBeInstanceOf(AuthError);
    expect(err).not.toBeInstanceOf(RateLimitError);
    expect(err).not.toBeInstanceOf(NotFoundError);
    expect(err).not.toBeInstanceOf(ValidationError);
    expect(err).not.toBeInstanceOf(ServerError);
    expect(err.statusCode).toBe(418);
    expect(err.message).toContain("teapot");
  });

  it("falls back to base OP3APIError when status is undefined (network failure)", () => {
    const err = mapHttpStatusToError(undefined, "ECONNREFUSED", "/x");
    expect(err).toBeInstanceOf(OP3APIError);
    expect(err.statusCode).toBe(0);
    expect(err.message).toContain("ECONNREFUSED");
  });
});

describe("extractErrorDetail", () => {
  it("returns the error field from a JSON object body", () => {
    expect(extractErrorDetail('{"error":"Invalid show UUID"}', "fallback")).toBe(
      "Invalid show UUID",
    );
  });

  it("returns the message field from a JSON object body when error is absent", () => {
    expect(extractErrorDetail('{"message":"Bad request"}', "fallback")).toBe("Bad request");
  });

  it("returns a plain-text body as-is", () => {
    expect(extractErrorDetail("unauthorized", "fallback")).toBe("unauthorized");
  });

  it("falls back when the body is empty", () => {
    expect(extractErrorDetail("", "fallback")).toBe("fallback");
  });

  it("returns the raw JSON string when it parses to an object with no error or message field", () => {
    // Per spec: falls through to the plain-text branch, not straight to
    // `fallback`, since the raw body is still non-empty and informative.
    expect(extractErrorDetail('{"status":"false"}', "fallback")).toBe('{"status":"false"}');
  });

  it("falls back only when the body is truly empty", () => {
    expect(extractErrorDetail("   ", "fallback")).toBe("fallback");
  });

  it("caps the returned detail at 500 chars", () => {
    const long = "x".repeat(1000);
    expect(extractErrorDetail(long, "fallback")).toHaveLength(500);
  });

  it("caps a JSON error field at 500 chars", () => {
    const long = "y".repeat(1000);
    expect(extractErrorDetail(JSON.stringify({ error: long }), "fallback")).toHaveLength(500);
  });
});
