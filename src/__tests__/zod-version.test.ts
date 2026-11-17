import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";

const require = createRequire(import.meta.url);

describe("zod runtime", () => {
  it("is at least 4.6.6, the GHSA-mrhx-c7xc-m3w5 fix", () => {
    const { version } = JSON.parse(readFileSync(require.resolve("zod/package.json"), "utf8")) as { version: string };
    const [major, minor, patch] = version.split(".").map(Number);
    expect(major * 1e6 + minor * 1e3 + patch).toBeGreaterThanOrEqual(4_006_006);
  });
});
