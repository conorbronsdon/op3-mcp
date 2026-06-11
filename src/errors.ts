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
