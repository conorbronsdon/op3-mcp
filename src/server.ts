import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { OP3Client } from "./client.js";
import { aggregateBy, rankCounts, stripNulls } from "./shape.js";

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(stripNulls(data), null, 2) }],
});

export function createServer(client: OP3Client): McpServer {
  const server = new McpServer({
    name: "op3-mcp",
    version: "0.1.0",
  });

  const showIdArg = z
    .string()
    .describe(
      "Show identifier: an OP3 show UUID (32 hex chars), a podcast:guid, or a base64-encoded feed URL. Use op3_get_show to resolve a feed to its UUID.",
    );

  // --- Show lookup ---

  server.tool(
    "op3_get_show",
    "Look up a podcast show on OP3 and get its UUID, title, podcast GUID, and stats page URL. Pass a show UUID, a podcast:guid, or a base64-encoded feed URL. This is the entry point: most other tools need the show UUID this returns. Set include_episodes to also list episodes (id, title, pubdate).",
    {
      identifier: showIdArg,
      include_episodes: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include the episode list. Off by default to keep the response small."),
      episode_limit: z
        .number()
        .optional()
        .default(10)
        .describe("Max episodes to return when include_episodes is true (default 10)."),
    },
    async ({ identifier, include_episodes, episode_limit }) => {
      const show = await client.getShow(identifier, include_episodes);
      const out: Record<string, unknown> = {
        showUuid: show.showUuid,
        title: show.title,
        podcastGuid: show.podcastGuid,
        statsPageUrl: show.statsPageUrl,
      };
      if (include_episodes && show.episodes) {
        out.episodeCount = show.episodes.length;
        out.episodes = show.episodes.slice(0, Math.max(1, episode_limit));
      }
      return json(out);
    },
  );

  // --- Show-level download summary ---

  server.tool(
    "op3_show_downloads",
    "Get a show's recent download summary from OP3: monthly downloads, a week-by-week breakdown, and the average weekly downloads. Use this for 'how many downloads does my show get' questions. Needs a show UUID (from op3_get_show).",
    {
      show_uuid: z.string().describe("OP3 show UUID (32 hex chars)."),
    },
    async ({ show_uuid }) => {
      const data = await client.getShowDownloadCounts(show_uuid);
      const entry = data.showDownloadCounts?.[show_uuid];
      if (!entry) {
        return json({
          showUuid: show_uuid,
          note: "OP3 returned no download counts for this show. It may have no data yet, or the UUID may be wrong.",
        });
      }
      return json({
        showUuid: show_uuid,
        asof: data.asof,
        days: entry.days,
        monthlyDownloads: entry.monthlyDownloads,
        weeklyAvgDownloads: entry.weeklyAvgDownloads,
        numWeeks: entry.numWeeks,
        weeklyDownloads: entry.weeklyDownloads,
      });
    },
  );

  // --- Episode-level downloads ---

  server.tool(
    "op3_episode_downloads",
    "Get per-episode download counts for a show from OP3: for each recent episode, downloads in the first 1/3/7/30 days after publish and all-time. Good for comparing how episodes perform. Needs a show UUID. Use limit to cap how many episodes come back.",
    {
      show_uuid: z.string().describe("OP3 show UUID (32 hex chars)."),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe("Max episodes to return, newest first (default 10)."),
      sort_by: z
        .enum(["recent", "downloads_all", "downloads7"])
        .optional()
        .default("recent")
        .describe("Order results: recent (default), all-time downloads, or 7-day downloads."),
    },
    async ({ show_uuid, limit, sort_by }) => {
      const data = await client.getEpisodeDownloadCounts(show_uuid);
      let episodes = data.episodes || [];
      if (sort_by === "downloads_all") {
        episodes = [...episodes].sort(
          (a, b) => (b.downloadsAll || 0) - (a.downloadsAll || 0),
        );
      } else if (sort_by === "downloads7") {
        episodes = [...episodes].sort(
          (a, b) => (b.downloads7 || 0) - (a.downloads7 || 0),
        );
      }
      return json({
        showUuid: data.showUuid,
        showTitle: data.showTitle,
        windowStart: data.minDownloadHour,
        windowEnd: data.maxDownloadHour,
        totalEpisodes: episodes.length,
        episodes: episodes.slice(0, Math.max(1, limit)),
      });
    },
  );

  // --- Top apps for a show ---

  server.tool(
    "op3_top_apps",
    "Get the top podcast apps and players downloading a show, from OP3, over the last three calendar months. Returns each app with its download count and percent share. Answers 'what apps do my listeners use'. Needs a show UUID.",
    {
      show_uuid: z.string().describe("OP3 show UUID (32 hex chars)."),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe("Max apps to return, ranked by downloads (default 10)."),
    },
    async ({ show_uuid, limit }) => {
      const data = await client.getTopAppsForShow(show_uuid);
      const { ranked, total } = rankCounts(data.appDownloads || {}, Math.max(1, limit));
      return json({
        showUuid: show_uuid,
        window: "last 3 calendar months",
        totalDownloads: total,
        appCount: Object.keys(data.appDownloads || {}).length,
        apps: ranked,
      });
    },
  );

  // --- Geography (computed from raw records) ---

  server.tool(
    "op3_top_countries",
    "Get the top listener countries (or regions) for a show. NOTE: OP3 has no native geography query, so this counts raw download records over a recent window and aggregates by country. It is a sample, not an exact lifetime total. Each result has a download count and percent share. Needs a show UUID. Keep max_records modest to stay fast and within rate limits.",
    {
      show_uuid: z.string().describe("OP3 show UUID (32 hex chars)."),
      by: z
        .enum(["country", "region"])
        .optional()
        .default("country")
        .describe("Aggregate by country code or by region (state/province) name."),
      start: z
        .string()
        .optional()
        .describe("Start of the window, ISO date or datetime (e.g. 2026-05-01). Defaults to OP3's recent window."),
      end: z
        .string()
        .optional()
        .describe("End of the window, ISO date or datetime."),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe("Max countries/regions to return, ranked (default 10)."),
      max_records: z
        .number()
        .optional()
        .default(5000)
        .describe("How many recent download records to sample for the aggregation (default 5000, cap 20000). Higher is more accurate but slower."),
    },
    async ({ show_uuid, by, start, end, limit, max_records }) => {
      const cap = Math.min(Math.max(100, max_records), 20000);
      const records = await client.collectDownloadRecords({
        showUuid: show_uuid,
        start,
        end,
        cap,
      });
      const field = by === "region" ? "regionName" : "countryCode";
      const { ranked, counted } = aggregateBy(records, field, Math.max(1, limit));
      return json({
        showUuid: show_uuid,
        aggregatedBy: by,
        note: "Computed from a sample of raw OP3 download records, not an exact total.",
        recordsSampled: records.length,
        recordsWithGeo: counted,
        window: { start: start || "OP3 default", end: end || "now" },
        results: ranked,
      });
    },
  );

  // --- Raw downloads time-series ---

  server.tool(
    "op3_downloads_timeseries",
    "Fetch raw download records for a show from OP3 over a date range. Returns individual download events (time, country, app, device). This is the low-level feed behind the other tools. Use it when you need to filter by episode or a specific date window. Keep limit low (records are verbose). For totals or geography summaries, prefer op3_show_downloads / op3_top_countries.",
    {
      show_uuid: z.string().describe("OP3 show UUID (32 hex chars)."),
      start: z
        .string()
        .optional()
        .describe("Start time, ISO date or datetime (e.g. 2026-06-01 or 2026-06-01T00:00:00Z)."),
      end: z.string().optional().describe("End time, ISO date or datetime."),
      episode_id: z
        .string()
        .optional()
        .describe("Filter to a single episode by its OP3 episodeId."),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe("Max records to return (default 20, cap 200). Records are verbose; keep this small."),
    },
    async ({ show_uuid, start, end, episode_id, limit }) => {
      const cappedLimit = Math.min(Math.max(1, limit), 200);
      const data = await client.getDownloads({
        showUuid: show_uuid,
        start,
        end,
        episodeId: episode_id,
        limit: cappedLimit,
      });
      const rows = (data.rows || []).slice(0, cappedLimit).map((r) => ({
        time: r.time,
        episodeId: r.episodeId,
        countryCode: r.countryCode,
        regionName: r.regionName,
        agentName: r.agentName,
        deviceType: r.deviceType,
        deviceName: r.deviceName,
        referrerName: r.referrerName,
      }));
      return json({
        showUuid: show_uuid,
        returned: rows.length,
        hasMore: Boolean(data.continuationToken),
        rows,
      });
    },
  );

  return server;
}
