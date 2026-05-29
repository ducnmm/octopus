FROM node:24-alpine AS build

RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/cli/package.json ./apps/cli/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN pnpm install --frozen-lockfile --filter @octopus/web...

COPY apps/web ./apps/web

ARG VITE_SUI_NETWORK=testnet
ARG VITE_SUI_RPC_URL=https://fullnode.testnet.sui.io:443
ARG VITE_SUI_PACKAGE_ID
ARG VITE_OCTOPUS_ACCOUNT_REGISTRY_ID
ARG VITE_OCTOPUS_REPO_REGISTRY_ID

ENV VITE_SUI_NETWORK=$VITE_SUI_NETWORK
ENV VITE_SUI_RPC_URL=$VITE_SUI_RPC_URL
ENV VITE_SUI_PACKAGE_ID=$VITE_SUI_PACKAGE_ID
ENV VITE_OCTOPUS_ACCOUNT_REGISTRY_ID=$VITE_OCTOPUS_ACCOUNT_REGISTRY_ID
ENV VITE_OCTOPUS_REPO_REGISTRY_ID=$VITE_OCTOPUS_REPO_REGISTRY_ID

RUN pnpm --filter @octopus/web build

FROM node:24-alpine AS runtime

RUN npm install -g serve

WORKDIR /app

COPY --from=build /app/apps/web/dist ./dist

ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "serve -s dist -l tcp://0.0.0.0:${PORT}"]
