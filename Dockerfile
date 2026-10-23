# syntax=docker/dockerfile:1
FROM node:24-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS build
# better-sqlite3 compiles its native module on install
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@12.14.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/
COPY web/package.json web/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build \
  && pnpm --filter server deploy --legacy --prod /out
# better-auth lists drizzle-kit as an optional peer, so the production install pulls in
# drizzle-kit, tsx and three esbuild binaries that keyhall never runs. Drop them.
RUN cd /out/node_modules/.pnpm \
  && rm -rf drizzle-kit@* esbuild@* @esbuild+* @esbuild-kit+* tsx@* \
    node_modules/drizzle-kit node_modules/esbuild node_modules/@esbuild \
    node_modules/@esbuild-kit node_modules/tsx \
    node_modules/.bin/drizzle-kit node_modules/.bin/esbuild node_modules/.bin/tsx

FROM node:24-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 DATABASE_PATH=/data/keyhall.db
WORKDIR /app/server
COPY --from=build /out ./
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/drizzle ./drizzle
COPY --from=build /app/web/dist /app/web/dist
# Release version, read by the server for /api/health
COPY --from=build /app/package.json /app/package.json
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8787
LABEL org.opencontainers.image.title="keyhall" \
  org.opencontainers.image.description="Self-hosted hub for MCP servers, APIs and secrets" \
  org.opencontainers.image.source="https://github.com/luizgustavosaraiva/keyhall" \
  org.opencontainers.image.licenses="PolyForm-Noncommercial-1.0.0"
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/index.js"]
