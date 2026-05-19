FROM node:24-alpine AS build

RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

WORKDIR /app

COPY package.json ./
RUN pnpm install --no-frozen-lockfile

COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src

RUN printf '%s\n' \
    '{' \
    '  "compilerOptions": {' \
    '    "target": "ES2022",' \
    '    "module": "NodeNext",' \
    '    "moduleResolution": "NodeNext",' \
    '    "strict": true,' \
    '    "esModuleInterop": true,' \
    '    "forceConsistentCasingInFileNames": true,' \
    '    "resolveJsonModule": true,' \
    '    "skipLibCheck": true,' \
    '    "declaration": true,' \
    '    "declarationMap": true,' \
    '    "sourceMap": true,' \
    '    "outDir": "dist"' \
    '  }' \
    '}' > /tsconfig.base.json

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

RUN pnpm build

FROM node:24-alpine AS runtime

RUN npm install -g serve

WORKDIR /app

COPY --from=build /app/dist ./dist

ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "serve -s dist -l tcp://0.0.0.0:${PORT}"]
