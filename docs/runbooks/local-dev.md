---
title: Local Development Runbook
description: Host-based local setup, service URLs, reset steps, and troubleshooting.
---

# Local Development Runbook

This runbook covers the current host-based development flow.

## 1. Install Dependencies

```bash
pnpm install
```

Optional local `.env`:

```bash
cp .env.example .env
```

The default `.env.example` is suitable for local fallback storage:

- `OCTOPUS_SUI_MODE=local`
- `OCTOPUS_WALRUS_MODE=local`
- `OCTOPUS_SEAL_MODE=local`
- `OCTOPUS_DATA_DIR=./data`

## 2. Start Services

Terminal 1:

```bash
pnpm dev:server
```

Terminal 2:

```bash
pnpm dev:web
```

Optional docs app:

```bash
pnpm dev:docs
```

Default URLs:

| Service | URL |
|---|---|
| Server/API/UI | `http://127.0.0.1:48787` |
| Wallet login app | `http://127.0.0.1:45173` |
| Documentation app | `http://127.0.0.1:3004` |
| Git remote path | `http://127.0.0.1:48787/<owner>/<repo>.git` |

## 3. Log In

```bash
pnpm octopus auth login --dev
pnpm octopus auth whoami
```

Use `--no-browser` if your environment cannot open a browser automatically.

## 4. Create And Push A Repo

From a local Git repository:

```bash
pnpm octopus repo create demo --public --dev
pnpm octopus repo connect <owner-from-create>/demo --remote origin --dev
git push origin main
```

Open:

```text
http://127.0.0.1:48787/<owner-from-create>/demo
```

## 5. Inspect Local State

```bash
find data/repos -maxdepth 3 -type d
find data/manifests -maxdepth 4 -type f
find data/walrus/blobs -maxdepth 2 -type f
find data/sui/repos -maxdepth 4 -type f
```

Useful API checks:

```bash
curl -s http://127.0.0.1:48787/v1/repos | jq
curl -s http://127.0.0.1:48787/v1/repos/<owner>/<repo>/index | jq
curl -s "http://127.0.0.1:48787/v1/repos/<owner>/<repo>/tree?ref=main" | jq
```

Private repos or authenticated endpoints require CLI-generated auth headers.
Prefer `pnpm octopus` commands for those paths.

## 6. Restore Cache

```bash
pnpm octopus repo manifests <owner>/<repo> --dev
rm -rf ./data/repos/<owner>/<repo>.git
pnpm octopus repo restore <owner>/<repo> --dev
git clone http://127.0.0.1:48787/<owner>/<repo>.git restored-repo
```

## 7. Reset Local Data

Stop the server, then remove the data directory:

```bash
rm -rf ./data
```

This deletes local repo cache, local Sui mirror, manifests, local Walrus fallback
blobs, and web/session state derived from the local data dir. You will need to
log in again and recreate repositories.

## 8. Run Checks

```bash
pnpm check
pnpm build
pnpm test
```

Move package:

```bash
cd contracts/sui
sui move test
```

## Troubleshooting

| Symptom | Check |
|---|---|
| CLI logs into hosted server instead of local | Add `--dev` or set `OCTOPUS_SERVER_URL=http://127.0.0.1:48787`. |
| Browser login opens but callback times out | Confirm the CLI terminal is still waiting and no firewall blocked the local callback URL. |
| `git push` returns missing auth token | Run `octopus repo connect <owner>/<repo>` again inside the Git repository. |
| `repo create` fails in testnet mode | Ensure `SUI_PACKAGE_ID`, `OCTOPUS_ACCOUNT_REGISTRY_ID`, and `OCTOPUS_REPO_REGISTRY_ID` are configured. |
| Walrus CLI mode fails | Confirm `WALRUS_BIN` exists and `OCTOPUS_WALRUS_MODE=cli`. Use `OCTOPUS_WALRUS_MODE=local` for fallback storage. |
| Private durable push fails | Use `OCTOPUS_SEAL_MODE=seal`; local seal is rejected for durable Walrus storage. |
| File viewer reports truncation | Raise `OCTOPUS_INDEX_TREE_LIMIT` or `OCTOPUS_BLOB_VIEW_LIMIT_BYTES` as needed. |
