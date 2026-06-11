import { describe, it, expect, vi, afterEach } from "vitest";
import { OP3Client } from "../client.js";
import { AuthError, NotFoundError, RateLimitError } from "../errors.js";

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
  it("sends the token as a query param and bearer header", async () => {
    const fetchMock = mockFetch(200, { showUuid: "abc", title: "Test Show" });
    vi.stubGlobal("fetch", fetchMock);

    const client = new OP3Client("tok123");
    const result = await client.getShow("abc");

    expect(result.title).toBe("Test Show");
    const [calledUrl, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain("token=tok123");
    expect((opts.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok123",
    );
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
