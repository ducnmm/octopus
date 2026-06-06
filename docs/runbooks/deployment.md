---
title: Deployment Runbook
description: Hosted testnet deployment modes, required variables, smoke tests, and recovery notes.
---

# Deployment Runbook

Octopus can run in a local/dev mode or a hosted testnet mode. Production-like
deployments should use live Sui registry IDs, durable Walrus storage, stable web
session secrets, and funded server signer keys.

## Deployment Modes

| Mode | Sui | Walrus | Private artifact encryption | Use case |
|---|---|---|---|---|
| Local fallback | Local mirror under `data/sui` | `data/walrus/blobs` | Local seal | Development and tests. |
| Testnet + local Walrus | Live Sui testnet | Local fallback | Local or SEAL | Contract/API testing without durable artifact writes. |
| Testnet + Walrus CLI | Live Sui testnet | `walrus store/read` | SEAL for private repos | Operator-managed Walrus CLI environments. |
| Testnet + relay | Live Sui testnet | Walrus upload relay and aggregator | SEAL for private repos | Hosted deployment path. |

## Hosted Server Checklist

Set at minimum:

```bash
OCTOPUS_HOST=0.0.0.0
PORT=<platform-port>
OCTOPUS_WEB_URL=<public-web-url>
OCTOPUS_WEB_SESSION_SECRET=<stable-random-secret>

OCTOPUS_SUI_MODE=testnet
SUI_NETWORK=testnet
SUI_RPC_URL=https://fullnode.testnet.sui.io:443
SUI_PACKAGE_ID=<package-id>
OCTOPUS_ACCOUNT_REGISTRY_ID=<account-registry-id>
OCTOPUS_REPO_REGISTRY_ID=<repo-registry-id>
SERVER_SUI_PRIVATE_KEYS=<funded-suiprivkey-or-hex-key>
```

For durable Walrus relay storage:

```bash
OCTOPUS_WALRUS_MODE=relay
WALRUS_NETWORK=testnet
OCTOPUS_WALRUS_EPOCHS=50
WALRUS_UPLOAD_RELAY_URL=https://upload-relay.testnet.walrus.space
WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space
```

For production-style private repositories:

```bash
OCTOPUS_SEAL_MODE=seal
SEAL_THRESHOLD=1
SEAL_KEY_SERVERS=<server-1>,<server-2>
```

Use `SEAL_SERVER_CONFIGS` instead of `SEAL_KEY_SERVERS` when the deployment needs
weighted or aggregator-backed key server configuration.

## Web App Checklist

Set the Vite-facing Sui variables:

```bash
VITE_SUI_NETWORK=testnet
VITE_SUI_RPC_URL=https://fullnode.testnet.sui.io:443
VITE_SUI_PACKAGE_ID=<package-id>
VITE_OCTOPUS_ACCOUNT_REGISTRY_ID=<account-registry-id>
VITE_OCTOPUS_REPO_REGISTRY_ID=<repo-registry-id>
```

The hosted server advertises `OCTOPUS_WEB_URL` through `/v1/auth/config`, so CLI
login can discover the correct wallet login app when targeting that server.

## Build And Start

From the repository root:

```bash
pnpm install
pnpm build
pnpm --filter @octopus/server start
```

Web build:

```bash
pnpm --filter @octopus/web build
```

The root `Dockerfile`, `apps/web/Dockerfile`, and `railway.json` files define
the current hosted deployment shape.

## Smoke Test

After deploy:

```bash
octopus auth login --server <server-url>
octopus auth whoami
octopus repo create smoke --public --server <server-url>
octopus repo connect <owner>/smoke --server <server-url>
git push origin main
git clone <server-url>/<owner>/smoke.git smoke-clone
octopus repo manifests <owner>/smoke --server <server-url>
```

Restore smoke:

```bash
octopus repo restore <owner>/smoke --server <server-url>
```

Verify in the browser:

```text
<server-url>/<owner>/smoke
<server-url>/<owner>/smoke/activity
```

## Operations Notes

- Keep `OCTOPUS_WEB_SESSION_SECRET` stable across deploys and replicas.
- Keep `SERVER_SUI_PRIVATE_KEYS` funded for testnet repo creation, ref updates,
  Walrus relay writes, and SEAL decrypt support.
- Use `OCTOPUS_WALRUS_MODE=local` only for non-durable development deployments.
- Use `WALRUS_AGGREGATOR_URL` for restore from real Walrus blobs without
  shelling out to `walrus read`.
- Rotate server keys by adding the new key, registering it as needed, deploying,
  verifying smoke tests, then removing the old key.
- Avoid deleting `OCTOPUS_DATA_DIR` in hosted environments unless restore from
  Sui and Walrus has been verified.

## Rollback And Recovery

If a deploy breaks web/API behavior but the previous version is available, roll
back the application image first. Do not wipe data as a first response.

If local bare repo cache is missing or corrupted:

```bash
octopus repo restore <owner>/<repo> --server <server-url>
```

Restore verifies stored artifact digest, decrypted plaintext digest for private
repos, and the restored Git ref before swapping the cache into place.
