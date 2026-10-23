# syntax=docker/dockerfile:1
FROM node:24-slim AS build
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

FROM node:24-slim
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
