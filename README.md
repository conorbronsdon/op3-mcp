<div align="center">

# op3-mcp

Podcast analytics for AI agents through OP3: downloads over time, listener geography, apps, and per-episode breakdowns. Read-only.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@conorbronsdon/op3-mcp?style=flat-square)](https://www.npmjs.com/package/@conorbronsdon/op3-mcp)
[![Node](https://img.shields.io/badge/Node-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Podcast](https://img.shields.io/badge/Podcast-Chain_of_Thought-purple?style=flat-square)](https://chainofthought.show)
[![X](https://img.shields.io/badge/X-@ConorBronsdon-black?style=flat-square&logo=x)](https://x.com/ConorBronsdon)

</div>

---


An MCP server for [OP3](https://op3.dev), the Open Podcast Prefix Project. It gives AI assistants podcast analytics that most hosting APIs do not expose: downloads over time, listener geography, the apps people listen in, and per-episode breakdowns.

**Read-only by design.** OP3 is an analytics service. This server only reads data. It cannot change anything, so it is safe to give an agent.

**Why this exists.** Most podcast hosts expose almost nothing through their API. Transistor's API, for example, returns download counts and not much else: no geography, no app share, no per-episode recency curve. OP3 has all of that, because it logs each download at the redirect. This server puts that data in front of an agent.

## What is OP3?

OP3 is a free, open analytics prefix for podcasts. You add `https://op3.dev/e/` in front of your enclosure URLs, and OP3 logs each download before redirecting to your real audio file. It then reports downloads, geography, and app share. Stats pages are public; the API needs a token. See https://op3.dev for details.

If your feed does not use the OP3 prefix yet, OP3 has no data for it. See "Adding the OP3 prefix" below.

## Tools

| Tool | What it returns | OP3 endpoint |
|------|-----------------|--------------|
| `op3_get_show` | Show UUID, title, podcast GUID, stats page URL, optional episode list | `GET /shows/{showUuidOrPodcastGuidOrFeedUrlBase64}` |
| `op3_show_downloads` | Monthly downloads, weekly breakdown, weekly average | `GET /queries/show-download-counts` |
| `op3_episode_downloads` | Per-episode downloads at 1/3/7/30 days and all-time | `GET /queries/episode-download-counts` |
| `op3_top_apps` | Top apps/players by download share, last 3 calendar months | `GET /queries/top-apps-for-show` |
| `op3_top_countries` | Top listener countries or regions (computed from raw records) | `GET /downloads/show/{showUuid}` |
| `op3_downloads_timeseries` | Raw download events over a date range (time, country, app, device) | `GET /downloads/show/{showUuid}` |

Most tools need a show UUID. Start with `op3_get_show` to turn a feed URL or podcast GUID into a UUID.

Every list tool takes a `limit` and defaults it low (10) to keep responses small. Agents pay tokens per response.

## Setup

### 1. Get a token

1. Go to https://op3.dev and sign in.
2. Open your API token page and copy the token.
3. For trying things out, OP3 also publishes a shared preview token, `preview07ce`, which works against public shows.

### 2. Find your show UUID

If you know your feed URL or podcast GUID, ask the assistant to run `op3_get_show` with it and it will return your UUID. You can also read the UUID from your show's OP3 stats page URL: `https://op3.dev/show/{showUuid}`.

### 3. Configure your MCP client

#### Claude Code

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "op3": {
      "command": "npx",
      "args": ["-y", "@conorbronsdon/op3-mcp"],
      "env": {
        "OP3_API_TOKEN": "your-op3-token"
      }
    }
  }
}
```

#### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "op3": {
      "command": "npx",
      "args": ["-y", "@conorbronsdon/op3-mcp"],
      "env": {
        "OP3_API_TOKEN": "your-op3-token"
      }
    }
  }
}
```

### 4. Verify

Ask your assistant: "Look up my show on OP3" with your feed URL, then "How many downloads did it get last month?"

## Adding the OP3 prefix (if you are not on OP3 yet)

OP3 only has data once downloads route through its prefix. To start:

1. In your podcast host, prepend `https://op3.dev/e/` to your episode audio URLs. Many hosts (Transistor, Buzzsprout, and others) have a one-click OP3 toggle. Check your host's settings for an "OP3" or "analytics prefix" option.
2. New downloads will start being logged. Historical downloads from before you added the prefix are not backfilled.
3. Find your show on https://op3.dev and note its stats page URL, which contains your show UUID.

## Limitations

Read these so you know what the numbers mean.

- **Geography is a computed sample, not an exact total.** OP3 has no country-level aggregate endpoint. `op3_top_countries` pulls raw download records and counts them by country on the client side. The result is representative, not a precise lifetime figure. OP3 returns raw records oldest-first, so the tool defaults to the **last 90 days** (`window_days`) when you do not pass an explicit `start` — otherwise the sample would be the show's *oldest* downloads, not recent listeners. Within the window, records are still sampled oldest-first, so on a high-volume show a `max_records` sample skews toward the start of the window; the response includes `sampleHitCap` so you can tell when the window held more records than were sampled. Raise `max_records` (cap 20000) for a larger, more representative sample at the cost of speed and rate-limit headroom.
- **No device breakdown tool.** OP3's raw records include a `deviceType` and `deviceName`, but there is no aggregate device query. You can see per-record device info via `op3_downloads_timeseries`. App share is available and exposed through `op3_top_apps`.
- **Top apps covers the last three calendar months only.** That window is fixed by OP3, not configurable.
- **Data starts when the prefix was added.** OP3 cannot report on downloads that never went through its redirect.
- **Bots are excluded by default** in OP3's download queries, which is usually what you want.
- **Rate limits are not publicly documented.** Keep `limit` and `max_records` modest. The server surfaces a clear error on HTTP 429.

## Development

```bash
git clone https://github.com/conorbronsdon/op3-mcp.git
cd op3-mcp
npm install
npm run build
npm test
```

Run locally:

```bash
OP3_API_TOKEN=your-token npm start
```

Tests mock `fetch` and make no network calls.

## Contributing

Issues and pull requests are welcome. If an OP3 endpoint changes shape, or there is an aggregate query worth wrapping as a tool, open an issue describing what you want and the OP3 endpoint it maps to. Keep the read-only contract: this server reports analytics, it does not change anything.

## About

Built and maintained by [Conor Bronsdon](https://github.com/conorbronsdon). I host the [Chain of Thought](https://chainofthought.show) podcast, which covers AI infrastructure, developer tools, and how practitioners actually use this stuff. I built this to pull honest listener analytics into the agent workflows that run the show.

Companion tools:

- [podcast-benchmark](https://github.com/conorbronsdon/podcast-benchmark): benchmark your show against peers on public signals. The public-data complement to your own private OP3 analytics here.
- [Transistor-MCP](https://github.com/conorbronsdon/Transistor-MCP): the Transistor.fm MCP server. Episodes, transcripts, and the download counts that OP3 fills out with geography and apps.
- [substack-mcp](https://github.com/conorbronsdon/substack-mcp): read posts and manage drafts on Substack, safe for agent workflows.
- [podcastindex-mcp](https://github.com/conorbronsdon/podcastindex-mcp): the Podcast Index MCP server, search by person or topic, trending shows, feed health.
- [ai-tools-for-creators](https://github.com/conorbronsdon/ai-tools-for-creators): a curated list of AI skills and MCP servers for people who ship ideas for a living.

More at [chainofthought.show](https://chainofthought.show) and on [X](https://x.com/ConorBronsdon).

---

## Disclaimer

*All views, opinions, and statements expressed on this account are solely my own and are made in my personal capacity. They do not reflect, and should not be construed as reflecting, the views, positions, or policies of Modular. This account is not affiliated with, authorized by, or endorsed by Modular in any way.*

## License

MIT
