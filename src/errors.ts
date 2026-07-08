/**
 * Typed error hierarchy for the OP3 API client.
 *
 * `OP3Client.request` maps every HTTP failure to one of these classes based
 * on status code (see `mapHttpStatusToError`), so callers can branch on
 * error type with `instanceof` instead of parsing status codes out of a
 * generic message.
 */

export class OP3APIError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public endpoint: string,
  ) {
    super(`OP3 API error (${statusCode}) at ${endpoint}: ${message}`);
    this.name = "OP3APIError";
  }
}

export class AuthError extends OP3APIError {
  constructor(endpoint: string) {
    super(
      401,
      "Token is missing or invalid. Set OP3_API_TOKEN to a bearer token from your OP3 account (op3.dev, sign in, then Account or API token page).",
      endpoint,
    );
    this.name = "AuthError";
  }
}

export class RateLimitError extends OP3APIError {
  constructor(endpoint: string) {
    super(
      429,
      "Rate limited by OP3. Wait a bit and retry, or reduce the limit / date range on your query.",
      endpoint,
    );
    this.name = "RateLimitError";
  }
}

export class NotFoundError extends OP3APIError {
  constructor(endpoint: string, identifier: string) {
    super(
      404,
      `Show or resource "${identifier}" not found. Check the show UUID, podcast GUID, or feed URL. OP3 only has data for feeds that route downloads through the op3.dev prefix.`,
      endpoint,
    );
    this.name = "NotFoundError";
  }
}

/** HTTP 400 — malformed or invalid request parameters. */
export class ValidationError extends OP3APIError {
  constructor(endpoint: string, detail: string) {
    super(
      400,
      `Validation error: ${detail} — check the arguments passed to this tool.`,
      endpoint,
    );
    this.name = "ValidationError";
  }
}

/**
 * HTTP 5xx — failure on OP3's side. `status` defaults to 500 but callers
 * should pass the actual status (502, 503, ...) so the message reflects it.
 */
export class ServerError extends OP3APIError {
  constructor(endpoint: string, detail: string, status: number = 500) {
    super(
      status,
      `OP3 server error: ${detail} — the OP3 API may be experiencing issues, try again later.`,
      endpoint,
    );
    this.name = "ServerError";
  }
}

/**
 * Maps an HTTP status code + error detail string to the appropriate typed
 * error, centralizing the branching that `OP3Client.request` used to do
 * inline. Falls back to the base `OP3APIError` for status codes outside the
 * mapped classes, or when no status is available (e.g. network failures).
 *
 * AuthError and RateLimitError intentionally discard `detail` and keep their
 * existing canned copy — that preserves the exact messages the pre-existing
 * 401/429 tests assert on.
 */
export function mapHttpStatusToError(
  status: number | undefined,
  detail: string,
  endpoint: string,
  identifier?: string,
): OP3APIError {
  if (status === 401 || status === 403) return new AuthError(endpoint);
  if (status === 429) return new RateLimitError(endpoint);
  if (status === 404) return new NotFoundError(endpoint, identifier ?? endpoint);
  if (status === 400) return new ValidationError(endpoint, detail);
  if (status !== undefined && status >= 500) return new ServerError(endpoint, detail, status);
  return new OP3APIError(status ?? 0, detail, endpoint);
}

/**
 * Pulls a human-readable detail string out of an OP3 error response body.
 * OP3 error bodies may be a bare text string or a JSON object with an
 * `error` or `message` field — this handles both so a JSON body doesn't
 * get stringified wholesale into the error message. Caps the returned
 * detail at 500 chars, matching the pre-existing `.slice(0, 500)` behavior
 * on the generic fallback branch in `OP3Client.request`.
 */
export function extractErrorDetail(responseData: string, fallback: string): string {
  try {
    const parsed: unknown = JSON.parse(responseData);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as { error?: unknown; message?: unknown };
      if (typeof obj.error === "string" && obj.error.length > 0) {
        return obj.error.slice(0, 500);
      }
      if (typeof obj.message === "string" && obj.message.length > 0) {
        return obj.message.slice(0, 500);
      }
    }
  } catch {
    // Not JSON — fall through to plain-text handling below.
  }
  const trimmed = responseData.trim();
  if (trimmed.length > 0) return trimmed.slice(0, 500);
  return fallback;
}
