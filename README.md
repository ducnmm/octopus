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

By default pushed artifacts are cached locally under `data/walrus/blobs`. To also
store pushed bundles through a local Walrus CLI, set:

```bash
OCTOPUS_WALRUS_MODE=cli
OCTOPUS_WALRUS_EPOCHS=5
WALRUS_BIN=walrus
```

For restore from a real Walrus blob without shelling out to `walrus read`, set
`WALRUS_AGGREGATOR_URL` to the target network aggregator, for example
`https://aggregator.walrus-testnet.walrus.space`.

During local development the Sui registry path is mirrored under
`data/sui/repos`. This gives push/restore tests the same ref-manifest shape as
the Move package before a package is published and wired to live Sui
transactions.

Create a local bare repo through the CLI:

```bash
pnpm octopus repo create demo --owner ducnmm
```

After a successful push, list generated artifact manifests:

```bash
pnpm octopus repo manifests ducnmm/demo
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
git remote add origin https://localhost:8787/ducnmm/demo.git
git push origin main

rm -rf ./data/repos/ducnmm/demo.git

octopus repo restore ducnmm/demo
git clone https://localhost:8787/ducnmm/demo.git restored-demo
```

Expected result: the restored clone has the same Git commit hash as the original repository.

## Current Status

- Implemented: local Git HTTP push/clone, bare repo cache, snapshot bundle artifacts, SHA-256 manifests, local Sui registry mirror, restore from Sui-shaped manifests, Walrus CLI upload mode, and Walrus Aggregator download mode.
- Scaffolded: Sui Move package with account, delegate, repo, ref state, and `push_ref` objects/functions.
- Not yet implemented: wallet login, live Sui transaction submission, live Sui manifest query during restore, and product UI/indexer surfaces.
