// Response shapes for the OP3 API (op3.dev/api/docs). Only fields this server
// reads are typed; unknown extra fields are ignored.

export interface ShowEpisode {
  id: string;
  title?: string;
  pubdate?: string;
}

export interface ShowInfoResponse {
  showUuid: string;
  title?: string;
  podcastGuid?: string;
  statsPageUrl?: string;
  episodes?: ShowEpisode[];
}

export interface WeeklyDownloads {
  weekStartTime: string;
  downloads: number;
}

export interface ShowDownloadCount {
  days?: number;
  monthlyDownloads?: number;
  weeklyDownloads?: WeeklyDownloads[];
  weeklyAvgDownloads?: number;
  numWeeks?: number;
}

export interface ShowDownloadCountsResponse {
  asof?: string;
  showDownloadCounts: Record<string, ShowDownloadCount>;
  queryTime?: number;
}

export interface EpisodeDownloadCount {
  itemGuid?: string;
  title?: string;
  pubdate?: string;
  downloads1?: number;
  downloads3?: number;
  downloads7?: number;
  downloads30?: number;
  downloadsAll?: number;
}

export interface EpisodeDownloadCountsResponse {
  showUuid: string;
  showTitle?: string;
  minDownloadHour?: string;
  maxDownloadHour?: string;
  episodes: EpisodeDownloadCount[];
  queryTime?: number;
}

export interface TopAppsForShowResponse {
  showUuid: string;
  // map of app name -> download count over the last 3 calendar months
  appDownloads: Record<string, number>;
  queryTime?: number;
}

export interface DownloadRecord {
  time?: string;
  url?: string;
  showUuid?: string;
  episodeId?: string;
  audienceId?: string;
  agentType?: string;
  agentName?: string;
  deviceType?: string;
  deviceName?: string;
  referrerType?: string;
  referrerName?: string;
  countryCode?: string;
  continentCode?: string;
  regionCode?: string;
  regionName?: string;
  timezone?: string;
  metroCode?: string;
}

export interface DownloadsResponse {
  rows: DownloadRecord[];
  count?: number;
  queryTime?: number;
  continuationToken?: string;
}
