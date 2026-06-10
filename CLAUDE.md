# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Octopus Is

Octopus is a recoverable Git forge: GitHub-like developer UX, **Walrus-backed
repository durability**, and **Sui-anchored ref history**. The server is a Git
gateway, cache, indexer, and search node — it is *not* the source of truth.
Durable state lives in Walrus blobs (Git bundle artifacts) and Sui registry
objects (identity, permissions, ref manifests). Everything under `data/` is
rebuildable cache. See `adr/0001-server-as-cache.md`.

## Commands

```bash
pnpm install                # Node 24+, pnpm 9+ required

pnpm check                  # typecheck all workspaces (builds shared first)
pnpm build                  # build all workspaces
pnpm test                   # run all vitest suites (builds shared first)

pnpm dev:server             # local server on http://127.0.0.1:48787
pnpm dev:web                # web SPA (full UI + wallet login/unlock) on :45173
pnpm dev:docs               # fumadocs site on :3004
pnpm octopus <args>         # run the CLI from source against built shared

cd contracts/sui && sui move test   # Move unit tests (needs Sui CLI)
```

Run a single workspace's tests by filtering, then pass vitest args after `--`:

```bash
pnpm --filter @octopus/server test                              # one package
pnpm --filter @octopus/server exec vitest run test/seal.test.ts # one file
pnpm --filter @octopus/server exec vitest run -t "rejects"      # by test name
```

### The shared-package build gotcha

`@ducnmm/octopus-shared` is consumed as a built artifact (`dist/`), not via live
TS. Every root script that needs it (`check`, `test`, `dev:server`, `octopus`)
**builds shared first** — replicate this if you invoke a workspace directly.
After editing `packages/shared/src`, rebuild it (`pnpm --filter
@ducnmm/octopus-shared build`) or downstream packages compile against stale types.

## Architecture

Monorepo via pnpm workspaces (`apps/*`, `packages/*`). All ESM
(`"type": "module"`), TypeScript strict, `NodeNext` resolution — **use `.js`
extensions in relative imports**.

| Path | Package | Role |
|---|---|---|
| `apps/server` | `@octopus/server` | Fastify Git HTTP + `/v1` JSON API + static SPA serving, auth, artifacts, restore, indexing. No HTML rendering. The core. |
| `apps/cli` | `@ducnmm/octopus` | Published CLI (`octopus`). Wallet login, delegate tokens, repo create/connect, restore, PRs. |
| `apps/web` | `@octopus/web` | React 19 + Vite SPA: the entire web UI (repos, commits, blobs, PRs, activity, access) plus the wallet login/unlock panels. Built bundle is served by the server. |
| `apps/docs` | `@octopus/docs` | Next.js + fumadocs documentation site. |
| `apps/indexer` | — | Empty scaffold (hosted indexer worker not yet implemented). |
| `packages/shared` | `@ducnmm/octopus-shared` | Zod request schemas, auth header names, delegate-token message format. The contract between CLI/server/web. |
| `contracts/sui` | Move package `octopus` | `account.move` + `registry.move`: accounts, delegates, repo registry, access control, ref manifests. |

### Server module map (`apps/server/src`)

`index.ts` → `loadConfig()` → `buildServer(config)` (`app.ts`), which registers
per-domain route plugins from `routes/`. Subsystems are split out:

- `config/env.ts` — all env-var parsing into one `ServerConfig`. Start here to
  understand runtime modes.
- `auth.ts` — delegate-key verification, signed `x-octopus-auth-token` parsing.
- `git.ts` — Git smart-HTTP, bare repo cache under `data/repos`.
- `artifacts.ts` / `restore.ts` — snapshot bundle creation and recovery.
- `walrus.ts` — three storage modes (see below).
- `sui.ts` — repo state, access roles, ref manifests. Local mirror vs testnet.
- `seal.ts` — private-artifact encryption (local deterministic vs SEAL).
- `enoki.ts` — optional sponsored-transaction support.
- `indexer.ts` / `repo-activity.ts` / `commit-actors.ts` — disposable file/commit/contribution index.
- `routes/spa.ts` — serves the built `@octopus/web` SPA bundle with an
  `index.html` history fallback (override location via `OCTOPUS_WEB_DIST_DIR`).
  The server renders no HTML itself; auth failures surface as structured JSON
  codes (`login_required` / `repo_locked`) the SPA turns into wallet flows.
- `pull-requests.ts`, `namespace.ts`, `push-attempts.ts`.

### Runtime modes (driven by env, parsed in `config.ts`)

These flags swap real decentralized backends for local stand-ins. Most tests and
local dev run fully local; testnet wiring is feature-flagged.

- **`OCTOPUS_SUI_MODE`** `local` (mirror under `data/sui/repos`) | `testnet`.
- **`OCTOPUS_WALRUS_MODE`** local fallback (`data/walrus/blobs`) | `cli` (`walrus` binary) | `relay` (upload relay + blob attributes + owner transfer).
- **`OCTOPUS_SEAL_MODE`** `local` deterministic seal | `seal` (SEAL key servers). Private pushes to durable Walrus require `seal` mode.

See `docs/reference/env-vars.md` for the full list and the README for example
configs.

### Auth model

CLI stores a **delegate private key** locally (registered against the wallet on
Sui or in the local mirror). REST and Git requests carry a signed
`x-octopus-auth-token` scoped `rest` or `git`. The token message format lives in
`packages/shared/src/index.ts` (`delegateAuthTokenMessage`) — keep CLI signing
and server verification in lockstep through that shared definition. Web sessions
use signed HTTP-only cookies keyed by `OCTOPUS_WEB_SESSION_SECRET`.

## Spec-Driven Development

This repo is spec-first. Code should trace back to a spec or ADR. Before
implementing a feature, define/update: the user flow (`specs/02-user-flows.md`),
the protocol contract (`specs/protocols/`), the acceptance behavior
(`specs/acceptance/`), and any architecture decision (`adr/`). Authoritative
ADRs: server-as-cache (0001), store-bundles-not-files (0002),
Move-only-anchors-refs (0003).

## Deployment

`Dockerfile` builds **only** shared + server (CLI/web/docs are not in the
runtime image) and runs via Railway (`railway.json`, healthcheck `/healthz`).
The Docker `watchPatterns` only cover `apps/server/**` and `packages/shared/**`.

## CI

`.github/workflows/ci.yml`: `pnpm check` → `pnpm test` → `pnpm build` on Node 24,
plus `sui move test` for contracts. Run these locally before pushing.
