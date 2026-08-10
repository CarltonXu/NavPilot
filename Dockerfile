FROM node:22-bookworm-slim AS client-builder

WORKDIR /build/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/index.html client/vite.config.js ./
COPY client/src ./src
RUN npm run build

FROM node:22-bookworm AS server-dependencies

WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=8787 \
    NAVPILOT_DB_PATH=/app/server/data/navpilot.db

WORKDIR /app/server
COPY --from=server-dependencies --chown=node:node /build/server/node_modules ./node_modules
COPY --chown=node:node server/package.json ./package.json
COPY --chown=node:node server/src ./src
COPY --from=client-builder --chown=node:node /build/client/dist /app/client/dist

RUN mkdir -p /app/server/data && chown node:node /app/server/data

USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 8787}/api/health`).then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"]

CMD ["node", "src/index.js"]
