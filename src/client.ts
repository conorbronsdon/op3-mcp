import {
  AuthError,
  NotFoundError,
  OP3APIError,
  RateLimitError,
} from "./errors.js";
import type {
  DownloadRecord,
  DownloadsResponse,
  EpisodeDownloadCountsResponse,
  ShowDownloadCountsResponse,
  ShowInfoResponse,
  TopAppsForShowResponse,
} from "./types.js";

const BASE_URL = "https://op3.dev/api/1";
const VERSION = "0.1.0";

/**
 * Client for the OP3 API (op3.dev). All endpoints here are read-only and map
 * directly to documented OP3 routes — see https://op3.dev/api/docs.
 */
export class OP3Client {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
    // OP3 accepts the token as a query param or bearer header. We send both so
    // the request works regardless of which the deployment prefers.
    if (this.token) {
      url.searchParams.set("token", this.token);
    }

    const endpoint = url.pathname;
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "User-Agent": `op3-mcp/${VERSION}`,
          ...(this.token
            ? { Authorization: `Bearer ${this.token}` }
            : {}),
        },
      });
    } catch (err) {
      throw new OP3APIError(
        0,
        `Network error reaching OP3: ${err instanceof Error ? err.message : String(err)}`,
        endpoint,
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new AuthError(endpoint);
    }
    if (response.status === 429) {
      throw new RateLimitError(endpoint);
    }
    if (response.status === 404) {
      throw new NotFoundError(endpoint, params.showUuid ? String(params.showUuid) : endpoint);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "unknown error");
      throw new OP3APIError(response.status, body.slice(0, 500), endpoint);
    }

    return (await response.json()) as T;
  }

  /** GET /shows/{showUuidOrPodcastGuidOrFeedUrlBase64} */
  async getShow(
    identifier: string,
    includeEpisodes = false,
  ): Promise<ShowInfoResponse> {
    return this.request<ShowInfoResponse>(`/shows/${encodeURIComponent(identifier)}`, {
      episodes: includeEpisodes ? "include" : undefined,
    });
  }

  /** GET /queries/show-download-counts?showUuid=... */
  async getShowDownloadCounts(
    showUuid: string,
  ): Promise<ShowDownloadCountsResponse> {
    return this.request<ShowDownloadCountsResponse>(
      "/queries/show-download-counts",
      { showUuid },
    );
  }

  /** GET /queries/episode-download-counts?showUuid=... */
  async getEpisodeDownloadCounts(
    showUuid: string,
  ): Promise<EpisodeDownloadCountsResponse> {
    return this.request<EpisodeDownloadCountsResponse>(
      "/queries/episode-download-counts",
      { showUuid },
    );
  }

  /** GET /queries/top-apps-for-show?showUuid=... */
  async getTopAppsForShow(
    showUuid: string,
  ): Promise<TopAppsForShowResponse> {
    return this.request<TopAppsForShowResponse>(
      "/queries/top-apps-for-show",
      { showUuid },
    );
  }

  /**
   * GET /downloads/show/{showUuid} — raw download records.
   * Used directly for time-range queries and as the source for the
   * client-side country aggregation (OP3 has no top-countries endpoint).
   */
  async getDownloads(args: {
    showUuid: string;
    start?: string;
    end?: string;
    episodeId?: string;
    limit?: number;
  }): Promise<DownloadsResponse> {
    return this.request<DownloadsResponse>(
      `/downloads/show/${encodeURIComponent(args.showUuid)}`,
      {
        format: "json",
        start: args.start,
        end: args.end,
        episodeId: args.episodeId,
        limit: args.limit,
      },
    );
  }

  /**
   * Page through download records up to `cap`, following continuationToken.
   * Country/region breakdowns are not a native OP3 query, so we aggregate
   * from the raw records here.
   */
  async collectDownloadRecords(args: {
    showUuid: string;
    start?: string;
    end?: string;
    episodeId?: string;
    cap: number;
  }): Promise<DownloadRecord[]> {
    const records: DownloadRecord[] = [];
    let token: string | undefined;
    const pageSize = Math.min(args.cap, 20000);

    do {
      const page = await this.request<DownloadsResponse>(
        `/downloads/show/${encodeURIComponent(args.showUuid)}`,
        {
          format: "json",
          start: args.start,
          end: args.end,
          episodeId: args.episodeId,
          limit: pageSize,
          continuationToken: token,
        },
      );
      records.push(...(page.rows || []));
      token = page.continuationToken;
      if (!page.rows || page.rows.length === 0) break;
    } while (token && records.length < args.cap);

    return records.slice(0, args.cap);
  }
}
