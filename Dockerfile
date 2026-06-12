# op3-mcp — stdio MCP server for OP3 podcast analytics
# Build:  docker build -t op3-mcp .
# Run:    docker run -i --rm -e OP3_API_TOKEN=... op3-mcp

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
RUN npm ci --ignore-scripts && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/dist ./dist

# Runtime environment variables (optional at startup — the server starts and
# answers introspection without them; tool calls fail with a clear error
# until they are set):
#   OP3_API_TOKEN — bearer token from https://op3.dev (sign in -> API token page)

USER node
CMD ["node", "dist/index.js"]
