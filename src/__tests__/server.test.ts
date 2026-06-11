import { describe, it, expect, vi } from "vitest";
import { createServer } from "../server.js";
import { OP3Client } from "../client.js";

/**
 * Drive a registered MCP tool's handler directly and parse its JSON text
 * result. The MCP SDK stores registered tools on `_registeredTools` and each
 * has a `handler` that returns a content array.
 */
async function callTool(
  server: ReturnType<typeof createServer>,
  name: string,
  args: Record<string, unknown>,
): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = (server as any)._registeredTools as Record<string, any>;
  const tool = tools[name];
  if (!tool) throw new Error(`tool ${name} not registered`);
  // The SDK validates and applies zod defaults before dispatching to the
  // handler. Mirror that here so tests exercise the real input path (defaults,
  // coercion, validation) rather than raw unparsed args.
  const parsed = tool.inputSchema ? tool.inputSchema.parse(args) : args;
  const result = await tool.handler(parsed, {} as any);
  const text = result.content[0].text;
  return JSON.parse(text);
}

/** Build a client whose `request`-backed methods are stubbed via fetch. */
function clientReturning(body: unknown, status = 200): OP3Client {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(typeof body === "string" ? body : JSON.stringify(body), {
          status,
        }),
    ),
  );
  return new OP3Client("tok");
}

describe("op3_show_downloads tool", () => {
  it("maps the entry keyed by the show UUID", async () => {
    const server = createServer(
      clientReturning({
        asof: "2026-06-10",
        showDownloadCounts: {
          uuid1: {
            days: "1111",
            monthlyDownloads: 49343,
            weeklyDownloads: [14172, 6943, 6647, 20349],
            weeklyAvgDownloads: 12028,
            numWeeks: 4,
          },
        },
      }),
    );
    const out = await callTool(server, "op3_show_downloads", {
      show_uuid: "uuid1",
    });
    expect(out.monthlyDownloads).toBe(49343);
    expect(out.weeklyDownloads).toEqual([14172, 6943, 6647, 20349]);
    // The opaque `days` bitmask must not leak into the agent-facing output.
    expect(out.days).toBeUndefined();
  });

  it("falls back to the only map entry when the key case differs", async () => {
    // OP3 keys results by the canonical lowercase UUID. A caller passing an
    // uppercase UUID must still get data, not a false 'no data' note.
    const server = createServer(
      clientReturning({
        asof: "2026-06-10",
        showDownloadCounts: {
          abc123: { monthlyDownloads: 500, weeklyAvgDownloads: 125, numWeeks: 4 },
        },
      }),
    );
    const out = await callTool(server, "op3_show_downloads", {
      show_uuid: "ABC123",
    });
    expect(out.note).toBeUndefined();
    expect(out.monthlyDownloads).toBe(500);
  });

  it("returns a clear note when OP3 has no counts", async () => {
    const server = createServer(
      clientReturning({ asof: "2026-06-10", showDownloadCounts: {} }),
    );
    const out = await callTool(server, "op3_show_downloads", {
      show_uuid: "uuid1",
    });
    expect(out.note).toMatch(/no download counts/i);
  });
});

describe("op3_top_countries tool", () => {
  it("defaults to a recent window (recent start, not the show's oldest records)", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return new Response(
          JSON.stringify({
            rows: [{ countryCode: "US" }, { countryCode: "US" }, { countryCode: "GB" }],
            continuationToken: undefined,
          }),
          { status: 200 },
        );
      }),
    );
    const server = createServer(new OP3Client("tok"));
    const out = await callTool(server, "op3_top_countries", {
      show_uuid: "uuid1",
    });

    // A `start` must be sent so OP3 (oldest-first) does not return 2022 records.
    expect(calls[0]).toMatch(/[?&]start=/);
    const startVal = new URL(calls[0]).searchParams.get("start")!;
    // Default window is 90 days; the start must be within the last ~year, i.e.
    // clearly recent, not the show's inception.
    const startMs = Date.parse(startVal);
    expect(Date.now() - startMs).toBeLessThan(120 * 86400000);
    expect(out.window.start).toBe(startVal);
    expect(out.results[0]).toEqual({ value: "US", downloads: 2, sharePct: 66.7 });
    expect(out.recordsWithGeo).toBe(3);
  });

  it("honors an explicit start over the default window", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return new Response(JSON.stringify({ rows: [], continuationToken: undefined }), {
          status: 200,
        });
      }),
    );
    const server = createServer(new OP3Client("tok"));
    await callTool(server, "op3_top_countries", {
      show_uuid: "uuid1",
      start: "2026-05-01",
    });
    expect(new URL(calls[0]).searchParams.get("start")).toBe("2026-05-01");
  });

  it("flags when the sample hit the record cap", async () => {
    // Cap the sample tiny via max_records; a full page means we hit the cap.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            rows: Array.from({ length: 100 }, () => ({ countryCode: "US" })),
            continuationToken: "more",
          }),
          { status: 200 },
        ),
      ),
    );
    const server = createServer(new OP3Client("tok"));
    const out = await callTool(server, "op3_top_countries", {
      show_uuid: "uuid1",
      max_records: 50, // floored to 100 by the handler -> one full page hits cap
    });
    expect(out.sampleHitCap).toBe(true);
  });
});

describe("op3_downloads_timeseries tool", () => {
  it("caps the limit at 200 and projects only the documented fields", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return new Response(
          JSON.stringify({
            rows: [
              {
                time: "2026-06-01T00:00:00Z",
                countryCode: "US",
                deviceName: "iPhone",
                hashedIpAddress: "secret",
                audienceId: "secret2",
              },
            ],
            continuationToken: "next",
          }),
          { status: 200 },
        );
      }),
    );
    const server = createServer(new OP3Client("tok"));
    const out = await callTool(server, "op3_downloads_timeseries", {
      show_uuid: "uuid1",
      limit: 9999,
    });
    expect(new URL(calls[0]).searchParams.get("limit")).toBe("200");
    expect(out.hasMore).toBe(true);
    // Privacy/efficiency: raw PII-ish fields must not be echoed back.
    expect(out.rows[0].hashedIpAddress).toBeUndefined();
    expect(out.rows[0].audienceId).toBeUndefined();
    expect(out.rows[0].countryCode).toBe("US");
  });
});

describe("op3_get_show tool", () => {
  it("omits episodes by default and caps them when included", async () => {
    const episodes = Array.from({ length: 50 }, (_, i) => ({
      id: `e${i}`,
      title: `Ep ${i}`,
    }));
    const server = createServer(
      clientReturning({
        showUuid: "uuid1",
        title: "Test Show",
        podcastGuid: "guid",
        statsPageUrl: "https://op3.dev/show/uuid1",
        episodes,
      }),
    );

    const noEps = await callTool(server, "op3_get_show", { identifier: "uuid1" });
    expect(noEps.episodes).toBeUndefined();
    expect(noEps.title).toBe("Test Show");

    const withEps = await callTool(server, "op3_get_show", {
      identifier: "uuid1",
      include_episodes: true,
      episode_limit: 5,
    });
    expect(withEps.episodeCount).toBe(50);
    expect(withEps.episodes).toHaveLength(5);
  });
});

describe("op3_top_apps tool", () => {
  it("ranks apps with share and reports the full app count", async () => {
    const server = createServer(
      clientReturning({
        showUuid: "uuid1",
        appDownloads: { "Apple Podcasts": 60, Overcast: 30, Snipd: 10 },
      }),
    );
    const out = await callTool(server, "op3_top_apps", {
      show_uuid: "uuid1",
      limit: 2,
    });
    expect(out.appCount).toBe(3);
    expect(out.apps).toHaveLength(2);
    expect(out.apps[0]).toEqual({
      name: "Apple Podcasts",
      downloads: 60,
      sharePct: 60,
    });
  });
});
