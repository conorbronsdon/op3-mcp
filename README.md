# op3-mcp

An MCP server for [OP3](https://op3.dev), the Open Podcast Prefix Project. It gives AI assistants podcast analytics that most hosting APIs do not expose: downloads over time, listener geography, the apps people listen in, and per-episode breakdowns.

**Read-only by design.** OP3 is an analytics service. This server only reads data. It cannot change anything, so it is safe to give an agent.

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

- **Geography is a computed sample, not an exact total.** OP3 has no country-level aggregate endpoint. `op3_top_countries` pulls raw download records over a recent window and counts them by country on the client side. The result is representative, not a precise lifetime figure. Raise `max_records` for a larger sample at the cost of speed and rate-limit headroom.
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

## License

MIT
