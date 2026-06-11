#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { OP3Client } from "./client.js";
import { createServer } from "./server.js";

async function main() {
  const token = process.env.OP3_API_TOKEN || "";

  if (!token) {
    console.error(
      "Warning: OP3_API_TOKEN is not set. Tools will error until a token is configured.",
    );
    console.error(
      "Get a token by signing in at https://op3.dev and opening your API token page. See README.md.",
    );
  }

  const client = new OP3Client(token);
  const server = createServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("OP3 MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
