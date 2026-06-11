import { describe, it, expect } from "vitest";
import { aggregateBy, rankCounts, stripNulls } from "../shape.js";
import type { DownloadRecord } from "../types.js";

describe("stripNulls", () => {
  it("drops null, undefined, and empty-string fields", () => {
    const input = { a: 1, b: null, c: undefined, d: "", e: "keep" };
    expect(stripNulls(input)).toEqual({ a: 1, e: "keep" });
  });

  it("recurses into nested objects and arrays", () => {
    const input = { outer: { x: null, y: 2 }, list: [{ z: "", w: 3 }] };
    expect(stripNulls(input)).toEqual({ outer: { y: 2 }, list: [{ w: 3 }] });
  });

  it("keeps zero and false (they are meaningful)", () => {
    const input = { count: 0, flag: false };
    expect(stripNulls(input)).toEqual({ count: 0, flag: false });
  });
});

describe("rankCounts", () => {
  it("ranks descending, caps at limit, and computes share", () => {
    const { ranked, total } = rankCounts(
      { Apple: 60, Spotify: 30, Other: 10 },
      2,
    );
    expect(total).toBe(100);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]).toEqual({ name: "Apple", downloads: 60, sharePct: 60 });
    expect(ranked[1].name).toBe("Spotify");
  });

  it("handles empty input without dividing by zero", () => {
    const { ranked, total } = rankCounts({}, 5);
    expect(total).toBe(0);
    expect(ranked).toEqual([]);
  });
});

describe("aggregateBy", () => {
  const records: DownloadRecord[] = [
    { countryCode: "US" },
    { countryCode: "US" },
    { countryCode: "GB" },
    { countryCode: undefined },
  ];

  it("counts by country and ignores missing values", () => {
    const { ranked, counted } = aggregateBy(records, "countryCode", 10);
    expect(counted).toBe(3);
    expect(ranked[0]).toEqual({ value: "US", downloads: 2, sharePct: 66.7 });
    expect(ranked[1]).toEqual({ value: "GB", downloads: 1, sharePct: 33.3 });
  });

  it("respects the limit", () => {
    const { ranked } = aggregateBy(records, "countryCode", 1);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].value).toBe("US");
  });
});
