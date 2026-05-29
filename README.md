# Octopus

Octopus is a recoverable Git forge: GitHub-like developer UX, Walrus-backed repository durability, and Sui-anchored ref history.

The server is a Git gateway, cache, indexer, and search node. The source of truth is stored in Walrus blobs and Sui registry objects.

## Spec-Driven Development

This repo is initialized spec-first. Before implementing a feature, define or update:

1. The user flow in `specs/02-user-flows.md`.
2. The protocol contract in `specs/protocols/`.
3. The acceptance behavior in `specs/acceptance/`.
4. Any architecture decision in `adr/`.

Code should trace back to a spec or ADR.

## Development

Prerequisites:

- Node.js 24+
- pnpm 9+
- Git CLI
- Sui CLI, for Move contract checks

Install dependencies:

```bash
pnpm install
```

Run the local server:

```bash
pnpm dev:server
```

Open `http://127.0.0.1:48787/` to view the minimal repository list UI.
Repository detail pages are available at `/{owner}/{repo}` with a file tree,
file viewer, commit list, and index metadata. The same indexed surfaces are
available as JSON under `/v1/repos/{owner}/{repo}/index`, `/commits`, `/tree`,
and `/blob?path=...`.

Run the wallet login page:

```bash
pnpm dev:web
```

Then authenticate the CLI and connect a Git remote:

```bash
pnpm octopus auth login --server http://127.0.0.1:48787 --web-url http://127.0.0.1:45173
pnpm octopus repo create demo --public
pnpm octopus repo connect <owner-from-create>/demo --remote origin --server http://127.0.0.1:48787
git push origin main
```

Repo owner namespaces default to the authenticated wallet's primary SuiNS name
when available, and fall back to the full wallet address. Passing `--owner`
requires either a SuiNS name ending in `.sui` that resolves to the authenticated
wallet or the authenticated wallet address itself.

In testnet mode the server exposes the deployed package and registry IDs from
`/v1/auth/config`, so login opens the on-chain wallet approval flow and registers
the CLI/server delegate keys before credentials are saved.

By default pushed artifacts are cached locally under `data/walrus/blobs`. To
store pushed bundles through the Walrus upload relay, set a server Sui key with
WAL/SUI funds. Relay uploads register Octopus metadata attributes on the Blob
object and transfer ownership to the repository owner wallet after certification:

```bash
OCTOPUS_WALRUS_MODE=relay
OCTOPUS_WALRUS_EPOCHS=50
SERVER_SUI_PRIVATE_KEYS=suiprivkey...
WALRUS_NETWORK=testnet
```

`WALRUS_UPLOAD_RELAY_URL` defaults to the selected network relay
(`https://upload-relay.testnet.walrus.space` on testnet). To use the local
Walrus CLI instead of the relay, set:

```bash
OCTOPUS_WALRUS_MODE=cli
OCTOPUS_WALRUS_EPOCHS=50
WALRUS_BIN=walrus
```

For restore from a real Walrus blob without shelling out to `walrus read`, set
`WALRUS_AGGREGATOR_URL` to the target network aggregator, for example
`https://aggregator.walrus-testnet.walrus.space`.

Private artifacts default to `local-seal` for local development and existing
testnet package compatibility. To use SEAL key-server access control, deploy the
Move package that includes `registry::seal_approve(id, repo, account)` and set:

```bash
OCTOPUS_SEAL_MODE=seal
SEAL_THRESHOLD=1
SEAL_KEY_SERVERS=0x...
```

`SEAL_SERVER_CONFIGS` can be used instead of `SEAL_KEY_SERVERS` for weighted or
aggregator-backed key server configs.

Private pushes to durable Walrus storage (`OCTOPUS_WALRUS_MODE=cli` or `relay`)
require `OCTOPUS_SEAL_MODE=seal`; the local deterministic seal is only accepted
for local development storage.

Web wallet sessions are stored in signed HTTP-only cookies. For deployed
servers, set `OCTOPUS_WEB_SESSION_SECRET` to the same high-entropy value on every
replica so sessions survive restarts and load balancing.

During local development the Sui registry path is mirrored under
`data/sui/repos`. This gives push/restore tests the same ref-manifest shape as
the Move package before a package is published and wired to live Sui
transactions.

Create a local bare repo through the CLI:

```bash
pnpm octopus repo create demo --public
```

After a successful push, list generated artifact manifests:

```bash
pnpm octopus repo manifests <owner-from-create>/demo
```

Run checks:

```bash
pnpm check
pnpm build
pnpm test
cd contracts/sui && sui move test
```

## Core Demo

```bash
octopus auth login
octopus repo create demo
git remote add origin http://127.0.0.1:48787/<owner-from-create>/demo.git
git push origin main

rm -rf ./data/repos/<owner-from-create>/demo.git

octopus repo restore <owner-from-create>/demo
git clone http://127.0.0.1:48787/<owner-from-create>/demo.git restored-demo
```

Expected result: the restored clone has the same Git commit hash as the original repository.

## Current Status

- Implemented: local Git HTTP push/clone, delegate-key CLI auth, repo-local Git `http.extraHeader` setup, authenticated push authorization, bare repo cache, snapshot bundle artifacts, SHA-256 manifests, local Sui registry mirror, restore from Sui-shaped manifests, Walrus CLI upload mode, Walrus upload relay mode with blob attributes and owner transfer, Walrus Aggregator download mode, local private artifact encryption, feature-flagged SEAL private artifact encryption, local file/commit indexing, repository file browser, file viewer, commit list, contribution activity, JSON index surfaces, Vite wallet login/unlock flows, signed web session cookies, and GitHub Actions CI.
- Scaffolded: Sui testnet adapter for delegate verification, `create_repo`, `push_ref`, and `seal_approve`; Postgres schema migration for accounts/repos/manifests/artifacts/push attempts; Sui Move package with account, delegate, private read allow list, delegate-authorized `push_ref`, and Move unit tests.
- Not yet implemented: hosted production indexer worker, code search, pull request review surfaces, issue tracker, and organization/team permission model.
