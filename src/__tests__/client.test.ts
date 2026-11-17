import { describe, it, expect, vi, afterEach } from "vitest";
import { OP3Client } from "../client.js";
import {
  AuthError,
  NotFoundError,
  RateLimitError,
  ValidationError,
  ServerError,
} from "../errors.js";

function mockFetch(status: number, body: unknown) {
  return vi.fn(
    async (_url: string, _init?: RequestInit): Promise<Response> =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OP3Client.request", () => {
  it("sends the token only as a bearer header, never in the URL", async () => {
    const fetchMock = mockFetch(200, { showUuid: "abc", title: "Test Show" });
    vi.stubGlobal("fetch", fetchMock);

    const client = new OP3Client("example-op3-token");
    const result = await client.getShow("abc");

    expect(result.title).toBe("Test Show");
    const [calledUrl, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe("https://op3.dev/api/1/shows/abc");
    expect(new URL(calledUrl).searchParams.has("token")).toBe(false);
    expect(calledUrl).not.toContain("example-op3-token");
    expect((opts.headers as Record<string, string>).Authorization).toBe(
      "Bearer example-op3-token",
    );
  });

  it("keeps the token out of the URL on every endpoint, including paged downloads", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit): Promise<Response> =>
        new Response(JSON.stringify({ rows: [], continuationToken: undefined }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new OP3Client("example-op3-token");
    await client.getShow("abc", true);
    await client.getShowDownloadCounts("abc");
    await client.getEpisodeDownloadCounts("abc");
    await client.getTopAppsForShow("abc");
    await client.getDownloads({ showUuid: "abc", limit: 5 });
    await client.collectDownloadRecords({ showUuid: "abc", cap: 5 });

    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls).toEqual([
      "https://op3.dev/api/1/shows/abc?episodes=include",
      "https://op3.dev/api/1/queries/show-download-counts?showUuid=abc",
      "https://op3.dev/api/1/queries/episode-download-counts?showUuid=abc",
      "https://op3.dev/api/1/queries/top-apps-for-show?showUuid=abc",
      "https://op3.dev/api/1/downloads/show/abc?format=json&limit=5",
      "https://op3.dev/api/1/downloads/show/abc?format=json&limit=5",
    ]);
    const auths = fetchMock.mock.calls.map(
      (c) => ((c[1] as RequestInit).headers as Record<string, string>).Authorization,
    );
    expect(auths).toEqual(Array(6).fill("Bearer example-op3-token"));
  });

  it("does not leak the token into a network error message", async () => {
    // A fetch failure whose message echoes the request URL, as some
    // network stacks do. The token must not appear in what the tool returns.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string): Promise<Response> => {
        throw new TypeError(`fetch failed for ${url}`);
      }),
    );
    const client = new OP3Client("example-op3-token");
    const err = await client.getShowDownloadCounts("x").catch((e) => e);
    expect(err.message).toBe(
      "OP3 API error (0) at /api/1/queries/show-download-counts: Network error reaching OP3: fetch failed for https://op3.dev/api/1/queries/show-download-counts?showUuid=x",
    );
    expect(err.message).not.toContain("example-op3-token");
  });

  it("sends no Authorization header and no token param when no token is set", async () => {
    const fetchMock = mockFetch(200, { showUuid: "abc", title: "Test Show" });
    vi.stubGlobal("fetch", fetchMock);

    await new OP3Client("").getShow("abc");

    const [calledUrl, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe("https://op3.dev/api/1/shows/abc");
    expect((opts.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("throws AuthError on 401", async () => {
    vi.stubGlobal("fetch", mockFetch(401, "unauthorized"));
    const client = new OP3Client("bad");
    await expect(client.getShowDownloadCounts("x")).rejects.toBeInstanceOf(
      AuthError,
    );
  });

  it("throws RateLimitError on 429", async () => {
    vi.stubGlobal("fetch", mockFetch(429, "slow down"));
    const client = new OP3Client("tok");
    await expect(client.getTopAppsForShow("x")).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it("throws NotFoundError on 404", async () => {
    vi.stubGlobal("fetch", mockFetch(404, "no such show"));
    const client = new OP3Client("tok");
    await expect(client.getShow("missing")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("throws ValidationError on 400", async () => {
    vi.stubGlobal("fetch", mockFetch(400, "missing show_uuid"));
    const client = new OP3Client("tok");
    const err = await client.getTopAppsForShow("x").catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.message).toContain("missing show_uuid");
  });

  it("throws ServerError on 500", async () => {
    vi.stubGlobal("fetch", mockFetch(500, "internal error"));
    const client = new OP3Client("tok");
    const err = await client.getShowDownloadCounts("x").catch((e) => e);
    expect(err).toBeInstanceOf(ServerError);
    expect(err.statusCode).toBe(500);
  });

  it("throws ServerError on 502, preserving the specific status", async () => {
    vi.stubGlobal("fetch", mockFetch(502, "bad gateway"));
    const client = new OP3Client("tok");
    const err = await client.getTopAppsForShow("x").catch((e) => e);
    expect(err).toBeInstanceOf(ServerError);
    expect(err.statusCode).toBe(502);
    expect(err.message).toContain("bad gateway");
  });

  it("maps show-download-counts response", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, {
        asof: "2026-06-09",
        showDownloadCounts: {
          uuid1: { monthlyDownloads: 1234, weeklyAvgDownloads: 300, numWeeks: 4 },
        },
      }),
    );
    const client = new OP3Client("tok");
    const data = await client.getShowDownloadCounts("uuid1");
    expect(data.showDownloadCounts.uuid1.monthlyDownloads).toBe(1234);
  });
});

describe("OP3Client.collectDownloadRecords", () => {
  it("follows the continuationToken and respects the cap", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            rows: [{ countryCode: "US" }, { countryCode: "GB" }],
            continuationToken: "next",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ rows: [{ countryCode: "DE" }], continuationToken: undefined }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = new OP3Client("tok");
    const records = await client.collectDownloadRecords({
      showUuid: "x",
      cap: 10,
    });
    expect(records).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops once the cap is reached", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          rows: [{ countryCode: "US" }, { countryCode: "GB" }],
          continuationToken: "more",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new OP3Client("tok");
    const records = await client.collectDownloadRecords({
      showUuid: "x",
      cap: 2,
    });
    expect(records).toHaveLength(2);
  });
});

describe("OP3Client.getShow feed-URL identifiers", () => {
  // OP3's own route for GET /shows/{id} (skymethod/op3,
  // worker/routes/api.ts): a feed URL only matches as urlsafe base64 with
  // literal `=` padding. Anything else falls through to a 404.
  const OP3_SHOWS_ROUTE =
    /^\/api\/1\/shows\/([0-9a-f]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-zA-Z_-]{15,}=*)$/;

  async function calledPath(identifier: string): Promise<string> {
    const fetchMock = mockFetch(200, { showUuid: "abc", title: "Test Show" });
    vi.stubGlobal("fetch", fetchMock);
    await new OP3Client("example-op3-token").getShow(identifier);
    return new URL(fetchMock.mock.calls[0][0] as string).pathname;
  }

  it("keeps base64 padding literal so OP3's shows route matches", async () => {
    // base64("https://example.com/feed.xml") — padded with "=="
    const path = await calledPath("aHR0cHM6Ly9leGFtcGxlLmNvbS9mZWVkLnhtbA==");
    expect(path).toBe("/api/1/shows/aHR0cHM6Ly9leGFtcGxlLmNvbS9mZWVkLnhtbA==");
    expect(OP3_SHOWS_ROUTE.test(path)).toBe(true);
  });

  it("maps standard base64 '+' and '/' to the urlsafe alphabet", async () => {
    // base64("https://example.com/?q=~~~>>>") contains '+' and '/'
    const path = await calledPath("aHR0cHM6Ly9leGFtcGxlLmNvbS8/cT1+fn4+Pj4=");
    expect(path).toBe("/api/1/shows/aHR0cHM6Ly9leGFtcGxlLmNvbS8_cT1-fn4-Pj4=");
    expect(OP3_SHOWS_ROUTE.test(path)).toBe(true);
  });

  it("leaves show UUIDs, podcast:guids and unpadded base64url unchanged", async () => {
    expect(await calledPath("0123456789abcdef0123456789abcdef")).toBe(
      "/api/1/shows/0123456789abcdef0123456789abcdef",
    );
    expect(await calledPath("917393e3-1b1e-5cef-ace4-edaa54e1f810")).toBe(
      "/api/1/shows/917393e3-1b1e-5cef-ace4-edaa54e1f810",
    );
    expect(await calledPath("aHR0cHM6Ly9leGFtcGxlLmNvbS9mZWVkLnhtbA")).toBe(
      "/api/1/shows/aHR0cHM6Ly9leGFtcGxlLmNvbS9mZWVkLnhtbA",
    );
  });
});
