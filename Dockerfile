FROM node:24-bookworm-slim AS build

RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/cli/package.json ./apps/cli/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
COPY apps/server ./apps/server

RUN pnpm --filter @ducnmm/octopus-shared build \
    && pnpm --filter @octopus/web build \
    && pnpm --filter @octopus/server build \
    && pnpm --filter @octopus/server deploy --prod /app/runtime

FROM node:24-bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV OCTOPUS_HOST=0.0.0.0
ENV OCTOPUS_DATA_DIR=/data

WORKDIR /app

COPY --from=build /app/runtime ./
# Built web SPA, served by the server (hashed assets + index.html fallback).
COPY --from=build /app/apps/web/dist ./web-dist
ENV OCTOPUS_WEB_DIST_DIR=/app/web-dist

EXPOSE 48787

CMD ["node", "dist/index.js"]
