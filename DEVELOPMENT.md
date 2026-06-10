# Local Development Guide

How to set up, run, and iterate on Octopus locally. For a product-oriented
walkthrough (push, clone, restore), see [docs/quickstart.md](docs/quickstart.md).
For every environment variable, see
[docs/reference/env-vars.md](docs/reference/env-vars.md).

## Prerequisites

- **Node.js 24+**
- **pnpm 9+** (`corepack enable` is the easiest way; the repo pins `pnpm@9.12.3`)
- **Git CLI**
- **Sui CLI** — only needed for Move contract work (`contracts/sui`)
- **Walrus CLI** — only needed when `OCTOPUS_WALRUS_MODE=cli`

Default local dev needs none of the decentralized backends: Sui, Walrus, and
SEAL all have local stand-ins (see [Runtime modes](#runtime-modes)).

## First-Time Setup

```bash
git clone <repo-url> octopus && cd octopus
pnpm install
cp .env.example .env        # local defaults work out of the box
pnpm check                  # typecheck everything (builds shared first)
pnpm test                   # full vitest suite
```

`.env` files are discovered by walking up from the current working directory.
Variables already in the process environment take precedence.

## Running the Stack

Each in its own terminal:

| Command | What | URL |
|---|---|---|
| `pnpm dev:server` | Fastify Git HTTP + REST API + HTML UI | http://127.0.0.1:48787 |
| `pnpm dev:web` | Wallet login/unlock app (React + Vite) | http://127.0.0.1:45173 |
| `pnpm dev:docs` | Documentation site (Next.js + fumadocs) | http://127.0.0.1:3004 |
| `pnpm octopus <args>` | CLI from source | — |

Typical local loop:

```bash
pnpm dev:server                                  # terminal 1
pnpm dev:web                                     # terminal 2 (only for auth login)
pnpm octopus auth login --dev                    # terminal 3
pnpm octopus repo create demo --public --dev
pnpm octopus repo connect <owner>/demo --remote origin --dev
git push origin main
```

Pass `--dev` to CLI commands to target the local server instead of the hosted
testnet default (or set `OCTOPUS_SERVER_URL`).

## The Shared-Package Build Gotcha

`@ducnmm/octopus-shared` (`packages/shared`) is consumed as a **built artifact**
(`dist/`), not live TypeScript. The root scripts (`check`, `test`, `dev:server`,
`octopus`) build it first automatically — but if you run a workspace directly
(e.g. `pnpm --filter @octopus/server exec vitest ...`) after editing
`packages/shared/src`, rebuild it yourself or you'll compile against stale types:

```bash
pnpm --filter @ducnmm/octopus-shared build
```

## Testing

```bash
pnpm test                                                        # everything
pnpm --filter @octopus/server test                               # one package
pnpm --filter @octopus/server exec vitest run test/seal.test.ts  # one file
pnpm --filter @octopus/server exec vitest run -t "rejects"       # by test name
cd contracts/sui && sui move test                                # Move contracts
```

Before pushing, run what CI runs (`.github/workflows/ci.yml`):

```bash
pnpm check && pnpm test && pnpm build
```

Lint/format:

```bash
pnpm lint        # eslint across workspaces
pnpm lint:fix
pnpm format      # prettier
```

## Runtime Modes

Env flags (parsed in `apps/server/src/config.ts`) swap real decentralized
backends for local stand-ins. Defaults are fully local:

| Flag | Local default | Real backend |
|---|---|---|
| `OCTOPUS_SUI_MODE` | `local` — mirror under `data/sui/repos` | `testnet` — live Sui registry (needs `SUI_PACKAGE_ID`, registry IDs, `SERVER_SUI_PRIVATE_KEYS`) |
| `OCTOPUS_WALRUS_MODE` | `local` — blobs under `data/walrus/blobs` | `cli` (walrus binary) or `relay` (upload relay) |
| `OCTOPUS_SEAL_MODE` | `local` — deterministic seal, dev only | `seal` — SEAL key servers; required for private pushes to durable Walrus |

## Data Directory

Everything under `data/` (`OCTOPUS_DATA_DIR`) is **rebuildable cache** — the
server is not the source of truth (see `adr/0001-server-as-cache.md`):

- `data/repos/` — bare Git repo cache
- `data/sui/repos/` — local Sui mirror (local mode)
- `data/walrus/blobs/` — local Walrus fallback (local mode)

It's safe to delete during local dev; in local mode you lose the local Sui
mirror and Walrus blobs too, so you're starting fresh. Deleting just
`data/repos/<owner>/<repo>.git` is the standard way to exercise the restore
flow (`pnpm octopus repo restore <owner>/<repo> --dev`).

## Code Conventions

- All ESM (`"type": "module"`), TypeScript strict, `NodeNext` resolution —
  **use `.js` extensions in relative imports**.
- Spec-first: features should trace to `specs/` (user flows, protocols,
  acceptance) and `adr/` decisions before implementation.
- The CLI/server/web contract (Zod schemas, auth header names, delegate-token
  message format) lives in `packages/shared/src/index.ts` — change it there,
  never fork it per app.

## Where to Look

| Concern | File(s) |
|---|---|
| Env parsing / runtime modes | `apps/server/src/config.ts` |
| Route wiring | `apps/server/src/server.ts` |
| Auth (delegate keys, signed tokens) | `apps/server/src/auth.ts`, `packages/shared/src/index.ts` |
| Git smart-HTTP + repo cache | `apps/server/src/git.ts` |
| Snapshot bundles / restore | `apps/server/src/artifacts.ts`, `apps/server/src/restore.ts` |
| Storage backends | `apps/server/src/walrus.ts`, `sui.ts`, `seal.ts` |
| Server-rendered HTML pages | `apps/server/src/web.ts` |
| Move contracts | `contracts/sui/sources/account.move`, `registry.move` |

## Troubleshooting

- **Stale types / “property does not exist” after editing `packages/shared`** —
  rebuild shared (see gotcha above).
- **CLI hits the hosted server instead of local** — add `--dev` or set
  `OCTOPUS_SERVER_URL=http://127.0.0.1:48787`.
- **Port conflicts** — server: `OCTOPUS_PORT` (default `48787`); web: Vite
  config in `apps/web`.
- **Push/restore behaves oddly** — wipe `data/` and re-create the repo; it's
  all disposable cache in local mode.
