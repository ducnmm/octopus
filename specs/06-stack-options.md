# Stack Options

This file records stack choices before implementation.

## Decision: Hackathon Stack

Use TypeScript for the off-chain apps:

- `apps/server`: Node.js HTTP server
- `apps/cli`: Node.js CLI
- `apps/web`: React/Vite or Next.js
- `apps/indexer`: Node.js worker
- `packages/shared`: shared types and protocol helpers
- `contracts/sui`: Move package

Why:

- one language for CLI/server/web/indexer
- fast iteration
- easy OpenAPI/schema sharing
- straightforward Git process integration

## Server Options

Good candidates:

- Fastify: pragmatic API server with good plugin model
- Hono: lightweight and fast
- Express: familiar but less structured

Decision: Fastify for the server.

## CLI Options

Good candidates:

- Commander
- Yargs
- Clipanion

Decision: Commander for MVP simplicity.

## Git Integration Options

Use the system `git` binary for MVP:

- `git init --bare`
- `git receive-pack`
- `git upload-pack`
- `git fsck`
- `git bundle`

Avoid implementing Git protocol internals unless needed.

## Search Options

MVP:

- SQLite/Postgres metadata
- simple path and exact text search

Later:

- symbol index
- semantic README/docs search
- AI code search
