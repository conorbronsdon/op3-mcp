import { describe, it, expect, vi, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server.js";
import { OP3Client } from "../client.js";

/**
 * Drive a real `tools/list` over an in-memory transport so the assertions
 * cover what an MCP client actually receives, not the server's internals.
 */
async function listTools() {
  const server = createServer(new OP3Client("tok"));
  const client = new Client({ name: "test", version: "0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  const { tools } = await client.listTools();
  await client.close();
  return tools;
}

const EXPECTED_TOOLS = [
  "op3_get_show",
  "op3_show_downloads",
  "op3_episode_downloads",
  "op3_top_apps",
  "op3_top_countries",
  "op3_downloads_timeseries",
];

/** Tools whose annotations do not declare the read-only contract. */
function notReadOnly(
  tools: { name: string; annotations?: Record<string, unknown> }[],
): string[] {
  return tools
    .filter(
      (t) =>
        t.annotations?.readOnlyHint !== true ||
        t.annotations?.destructiveHint !== false,
    )
    .map((t) => t.name);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("tool annotations", () => {
  it("lists exactly the documented tools", async () => {
    const tools = await listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...EXPECTED_TOOLS].sort());
  });

  it("declares every tool read-only, non-destructive, idempotent, open-world", async () => {
    const tools = await listTools();
    for (const tool of tools) {
      const { title, ...hints } = tool.annotations ?? {};
      expect(typeof title, `${tool.name} title`).toBe("string");
      expect(hints, tool.name).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    }
    expect(notReadOnly(tools)).toEqual([]);
  });

  it("negative control: the filter flags a tool missing readOnlyHint", async () => {
    const tools = await listTools();
    const withWriter = [
      ...tools,
      { name: "op3_delete_show", annotations: { destructiveHint: true } },
      { name: "op3_unannotated" },
      // Claims read-only but is destructive: only the destructiveHint
      // clause of the filter catches this one.
      { name: "op3_purge_cache", annotations: { readOnlyHint: true, destructiveHint: true } },
    ];
    expect(notReadOnly(withWriter)).toEqual([
      "op3_delete_show",
      "op3_unannotated",
      "op3_purge_cache",
    ]);
  });

  it("listing tools makes no network calls", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await listTools();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
