import type { DownloadRecord } from "./types.js";

/** Recursively drop null, undefined, and empty-string fields to save tokens. */
export function stripNulls<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripNulls(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === null || v === undefined || v === "") continue;
      out[k] = stripNulls(v);
    }
    return out as T;
  }
  return value;
}

/**
 * Turn a name->count map into a ranked, capped list with percentage share.
 * Used for top-apps. Output stays compact: [{ name, downloads, sharePct }].
 */
export function rankCounts(
  counts: Record<string, number>,
  limit: number,
): { ranked: { name: string; downloads: number; sharePct: number }[]; total: number } {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const ranked = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, downloads]) => ({
      name,
      downloads,
      sharePct: total > 0 ? Math.round((downloads / total) * 1000) / 10 : 0,
    }));
  return { ranked, total };
}

/**
 * Aggregate raw download records by a geography field into a ranked list.
 * OP3 has no native top-countries query, so this counts records client-side.
 */
export function aggregateBy(
  records: DownloadRecord[],
  field: keyof DownloadRecord,
  limit: number,
): { ranked: { value: string; downloads: number; sharePct: number }[]; counted: number } {
  const counts: Record<string, number> = {};
  let counted = 0;
  for (const r of records) {
    const key = r[field];
    if (!key) continue;
    counts[key] = (counts[key] || 0) + 1;
    counted++;
  }
  const ranked = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, downloads]) => ({
      value,
      downloads,
      sharePct: counted > 0 ? Math.round((downloads / counted) * 1000) / 10 : 0,
    }));
  return { ranked, counted };
}
