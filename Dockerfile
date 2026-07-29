FROM node:26-bookworm-slim AS build

ARG PNPM_VERSION=11.16.0
WORKDIR /workspace

RUN npm install --global "pnpm@${PNPM_VERSION}"

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

COPY apps/server apps/server
COPY apps/web apps/web
COPY packages/shared packages/shared
RUN pnpm build \
  && pnpm --filter @marktake/server deploy --prod /release/server

FROM node:26-bookworm-slim AS runtime

LABEL org.opencontainers.image.title="Marktake" \
  org.opencontainers.image.description="Focused, self-hosted review server for browser-ready video cuts" \
  org.opencontainers.image.source="https://github.com/arturict/marktake" \
  org.opencontainers.image.licenses="MIT"

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates ffmpeg tini \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=4180 \
  MARKTAKE_DATA_DIR=/data \
  MARKTAKE_WEB_DIST=/app/web

WORKDIR /app
COPY --from=build --chown=node:node /release/server ./
COPY --from=build --chown=node:node /workspace/apps/web/dist ./web
RUN mkdir -p /data && chown node:node /data

USER node
EXPOSE 4180
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4180/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
