---
title: Environment Variables Reference
description: Runtime configuration variables for the server, CLI, web app, Sui, Walrus, and SEAL.
---

# Environment Variables Reference

Octopus loads `.env` files by walking up from the current working directory
until it finds one. Variables already present in the process environment are not
overwritten by `.env`.

Copy the root template for local development:

```bash
cp .env.example .env
```

## Critical Path

| Variable | Component | Default | Notes |
|---|---|---|---|
| `OCTOPUS_SERVER_URL` | CLI | Hosted server unless local host/port is set | Default server URL for CLI commands. |
| `OCTOPUS_HOST` | Server/CLI | `127.0.0.1` locally, `0.0.0.0` on Railway | HTTP bind host. |
| `OCTOPUS_PORT` / `PORT` | Server/CLI | `48787` | HTTP port. `PORT` is accepted for hosting platforms. |
| `OCTOPUS_DATA_DIR` | Server | `./data` | Root for repo cache, manifests, local Sui mirror, and local Walrus fallback. |
| `SUI_NETWORK` | Server/Web | `localnet` server, `testnet` web template | Sui network label. |
| `OCTOPUS_SUI_MODE` | Server | `local` | Set to `testnet` for live Sui registry paths. |
| `SUI_RPC_URL` | Server/Web | Localnet or testnet fullnode | Sui JSON-RPC endpoint. |
| `SUI_PACKAGE_ID` | Server/CLI/Web | Empty | Move package ID. Required for testnet mode. |
| `OCTOPUS_ACCOUNT_REGISTRY_ID` | Server/CLI/Web | Empty | Account registry object ID. Required for testnet mode. |
| `OCTOPUS_REPO_REGISTRY_ID` | Server/CLI/Web | Empty | Repo registry object ID. Required for testnet mode. |
| `OCTOPUS_WALRUS_MODE` | Server | `local` | Storage mode: `local`, `cli`, `relay`, `walrus-relay`, or `upload-relay`. |
| `SERVER_SUI_PRIVATE_KEYS` | Server | Empty | Comma-separated Sui private keys for testnet transactions, Walrus relay, and SEAL decrypt. |
| `OCTOPUS_SEAL_MODE` | Server | `local` | `local` or `seal`. Durable private Walrus storage requires `seal`. |
| `OCTOPUS_WEB_SESSION_SECRET` | Server | Derived from data dir | Set a stable high-entropy secret in deployed environments. |

## Server Runtime

| Variable | Default | Notes |
|---|---|---|
| `OCTOPUS_HOST` | `127.0.0.1` or `0.0.0.0` on Railway | Bind host. |
| `OCTOPUS_PORT` | `48787` | Preferred local server port. |
| `PORT` | `48787` when `OCTOPUS_PORT` is absent | Hosting platform port fallback. |
| `OCTOPUS_DATA_DIR` | `./data` | Server data root. |
| `OCTOPUS_WEB_URL` | `http://127.0.0.1:45173` | Wallet login app URL advertised by `/v1/auth/config`. |
| `DATABASE_URL` | Empty | Optional Postgres URL for scaffolded DB-backed paths. |
| `OCTOPUS_WEB_SESSION_SECRET` | Deterministic hash of data dir | Use a real stable secret in production. |
| `OCTOPUS_DELEGATE_CACHE_TTL_MS` | `60000` | Server-side delegate verification cache TTL. |
| `OCTOPUS_BUILD_SHA` | Empty | Optional build metadata in server responses. |
| `OCTOPUS_INDEX_TREE_LIMIT` | `5000` | Max indexed tree entries before truncation. |
| `OCTOPUS_BLOB_VIEW_LIMIT_BYTES` | `1048576` | Max blob bytes shown by file viewer/API. |
| `OCTOPUS_PULL_REQUEST_PATCH_LIMIT_BYTES` | `524288` | Max pull request patch comparison bytes. |
| `ENOKI_PRIVATE_API_KEY` | Empty | Private Enoki API key used by the server for sponsored transactions. Alias: `OCTOPUS_ENOKI_PRIVATE_API_KEY`. |
| `ENOKI_API_URL` | Enoki default | Optional custom Enoki API URL for server-side sponsored transactions. Alias: `OCTOPUS_ENOKI_API_URL`. |

## Sui

| Variable | Default | Notes |
|---|---|---|
| `OCTOPUS_SUI_MODE` | `local` | `testnet` enables live Sui transaction paths. |
| `SUI_NETWORK` | `localnet` | Network label used by server config. |
| `SUI_RPC_URL` | `http://127.0.0.1:9000` for localnet, testnet fullnode when `SUI_NETWORK=testnet` | Sui JSON-RPC endpoint. |
| `SUI_PACKAGE_ID` | Empty | Move package address. Required in testnet mode and SEAL approval paths. |
| `OCTOPUS_ACCOUNT_REGISTRY_ID` | Empty | Account registry object ID. |
| `OCTOPUS_REPO_REGISTRY_ID` | Empty | Repo registry object ID. |
| `SERVER_SUI_PRIVATE_KEYS` | Empty | Preferred comma-separated server signer list. |
| `SERVER_ADMIN_PRIVATE_KEYS` | Empty | Legacy alias accepted by server config. |
| `SERVER_SUI_PRIVATE_KEY` | Empty | Single-key alias. |
| `SERVER_ADMIN_PRIVATE_KEY` | Empty | Single-key alias. |
| `PUBLISHER_PRIVATE_KEY` | Empty | Single-key alias. |

## Walrus

| Variable | Default | Notes |
|---|---|---|
| `WALRUS_NETWORK` | `testnet` | Walrus network. Falls back from `NETWORK` when set. |
| `OCTOPUS_WALRUS_MODE` | `local` | `local` writes to `data/walrus/blobs`; `cli` uses `walrus`; relay modes use upload relay. |
| `OCTOPUS_WALRUS_EPOCHS` | `50` | Storage duration for Walrus CLI/relay writes. |
| `WALRUS_BIN` | `walrus` | CLI binary used by `OCTOPUS_WALRUS_MODE=cli` and CLI read fallback. |
| `WALRUS_UPLOAD_RELAY_URL` | Network relay URL | Relay upload endpoint. |
| `WALRUS_AGGREGATOR_URL` | Network aggregator URL in server config | Aggregator used for non-local restore reads. |

Relay upload modes require a funded server Sui key through `SERVER_SUI_PRIVATE_KEYS`
or one of its single-key aliases.

## SEAL And Private Repositories

| Variable | Default | Notes |
|---|---|---|
| `OCTOPUS_SEAL_MODE` | `local` | Set `seal` for production-style SEAL encryption. |
| `SEAL_SERVER_CONFIGS` | Empty | JSON array for weighted or aggregator-backed SEAL key server configs. |
| `SEAL_KEY_SERVERS` | Empty | Comma-separated key server object IDs or URLs, depending on SEAL path. |
| `OCTOPUS_SEAL_KEY_SERVERS` | Empty | Alias for `SEAL_KEY_SERVERS`. |
| `SEAL_THRESHOLD` | Empty, parsed as `1` when set without a valid value | Positive integer threshold. |

Private pushes to durable Walrus storage (`cli` or relay modes) require
`OCTOPUS_SEAL_MODE=seal`. Local deterministic sealing is for development only.

## CLI

| Variable | Default | Notes |
|---|---|---|
| `OCTOPUS_SERVER_URL` | Hosted server unless local host/port is set | Default CLI target. |
| `OCTOPUS_HOST` | Empty | When set with no `OCTOPUS_SERVER_URL`, CLI builds a local server URL. |
| `OCTOPUS_PORT` | `48787` | Local server port used by CLI URL construction. |
| `OCTOPUS_WEB_URL` | Hosted web URL or local web URL in dev | Wallet login URL. |
| `OCTOPUS_OWNER` | Empty | Default owner namespace for `repo create`. |
| `SUI_PACKAGE_ID` | Empty | Optional login override. |
| `OCTOPUS_ACCOUNT_REGISTRY_ID` | Empty | Optional login override. |
| `OCTOPUS_REPO_REGISTRY_ID` | Empty | Optional login override. |

## Web App

| Variable | Default | Notes |
|---|---|---|
| `VITE_SUI_NETWORK` | `testnet` | Sui network label for wallet app. |
| `VITE_SUI_RPC_URL` | `https://fullnode.testnet.sui.io:443` | Sui JSON-RPC endpoint for wallet app. |
| `VITE_SUI_PACKAGE_ID` | Empty | Move package ID. |
| `VITE_OCTOPUS_ACCOUNT_REGISTRY_ID` | Empty | Account registry object ID. |
| `VITE_OCTOPUS_REPO_REGISTRY_ID` | Empty | Repo registry object ID. |
| `VITE_ENOKI_PUBLIC_API_KEY` | Empty | Public Enoki API key used by the wallet login app to register Enoki OAuth wallets. |
| `VITE_ENOKI_GOOGLE_CLIENT_ID` | Empty | Google OAuth client ID configured in Enoki. |
| `VITE_ENOKI_FACEBOOK_CLIENT_ID` | Empty | Facebook OAuth client ID configured in Enoki. |
| `VITE_ENOKI_TWITCH_CLIENT_ID` | Empty | Twitch OAuth client ID configured in Enoki. |
| `VITE_ENOKI_ONEFC_CLIENT_ID` | Empty | ONE Championship OAuth client ID configured in Enoki. |
| `VITE_ENOKI_PLAYTRON_CLIENT_ID` | Empty | Playtron OAuth client ID configured in Enoki. |
| `VITE_ENOKI_API_URL` | Enoki default | Optional custom Enoki API URL for the wallet login app. |
| `VITE_ENOKI_ADDITIONAL_EPOCHS` | Enoki default | Optional number of extra epochs for Enoki zkLogin sessions. |
| `VITE_ENOKI_SPONSOR_TRANSACTIONS` | `1` | Set to `0` to disable frontend attempts to use server-side Enoki sponsored transactions. |

## Deployment Metadata

| Variable | Component | Notes |
|---|---|---|
| `RAILWAY_ENVIRONMENT` | Server | Causes the server default host to become `0.0.0.0`. |
| `RAILWAY_GIT_COMMIT_SHA` | Server | Optional build metadata. |
| `RAILWAY_DEPLOYMENT_ID` | Server | Optional build metadata. |
| `RAILWAY_SERVICE_NAME` | Server | Optional build metadata. |

## Runtime Requirements

The server requires `git` >= 2.38 on its PATH: pull-request merges use
`git merge-tree --write-tree`, which first shipped in Git 2.38. The server
asserts this at startup and refuses to boot with an older Git.
