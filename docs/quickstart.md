---
title: Quickstart
description: Run Octopus locally or against hosted testnet, then push, clone, and restore a repository.
---

# Quickstart

This guide gets Octopus running, creates a repository, pushes through normal Git
HTTP, and restores a deleted local cache from stored artifacts.

## Prerequisites

- Node.js 24 or newer.
- pnpm 9 or newer.
- Git CLI.
- Sui CLI for Move contract checks and testnet contract work.
- Walrus CLI only when `OCTOPUS_WALRUS_MODE=cli`.

Install dependencies from the repository root:

```bash
pnpm install
```

## Use The Hosted Testnet Server

The published CLI defaults to the hosted testnet server.

```bash
npm install -g @ducnmm/octopus
octopus auth login
octopus repo create demo --public
```

Connect a local Git repository to the hosted remote:

```bash
octopus repo connect <owner-from-create>/demo
git push origin main
```

Use a custom server with either `OCTOPUS_SERVER_URL` or `--server`:

```bash
OCTOPUS_SERVER_URL=https://octopus-server.up.railway.app octopus repo create demo --public
octopus repo connect <owner-from-create>/demo --server https://octopus-server.up.railway.app
```

## Run Locally

Start the server:

```bash
pnpm dev:server
```

The server listens on `http://127.0.0.1:48787` by default.

Start the wallet login app in another terminal:

```bash
pnpm dev:web
```

The wallet app listens on `http://127.0.0.1:45173`.

Authenticate the CLI against the local stack:

```bash
pnpm octopus auth login --dev
```

Create a public repository and connect your current Git repository:

```bash
pnpm octopus repo create demo --public --dev
pnpm octopus repo connect <owner-from-create>/demo --remote origin --dev
git push origin main
```

Open the server UI:

```text
http://127.0.0.1:48787/
```

Repository pages are available at:

```text
http://127.0.0.1:48787/<owner>/<repo>
```

## Restore Demo

After a successful push, Octopus writes artifact manifests and stores a bundle
through the configured Walrus storage mode. In local fallback mode, artifacts
live under `data/walrus/blobs`.

List manifests:

```bash
pnpm octopus repo manifests <owner-from-create>/demo --dev
```

Simulate cache loss:

```bash
rm -rf ./data/repos/<owner-from-create>/demo.git
```

Restore the bare repo cache:

```bash
pnpm octopus repo restore <owner-from-create>/demo --dev
```

Clone from the restored cache:

```bash
git clone http://127.0.0.1:48787/<owner-from-create>/demo.git restored-demo
```

The restored clone should resolve to the same commit hash as the pushed
repository.

## Checks

Run TypeScript checks, builds, and tests:

```bash
pnpm check
pnpm build
pnpm test
```

Run Move contract tests:

```bash
cd contracts/sui
sui move test
```
