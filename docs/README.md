---
title: Octopus Documentation
description: Documentation map for the Octopus recoverable Git forge.
---

# Octopus Documentation

Octopus is a recoverable Git forge. It keeps the developer workflow close to
normal Git hosting while anchoring repository identity and ref history on Sui
and storing durable repository artifacts in Walrus.

This documentation is organized for three audiences:

1. New contributors who need to run the project locally.
2. Operators who need to configure hosted, testnet, Walrus, and private-repo
   paths.
3. Future maintainers who need a stable map from docs to code, specs, and ADRs.

The `specs/` directory remains the source of truth for product behavior,
protocol contracts, and acceptance criteria. This `docs/` directory focuses on
how to use, run, configure, and operate the current implementation.

## Start Here

- [Quickstart](./quickstart.md) - install, run, authenticate, create a repo,
  push, clone, and restore.
- [Architecture](./architecture.md) - system shape, data flows, and source of
  truth boundaries.
- [CLI Reference](./cli.md) - `octopus` commands and common flows.
- [API Reference](./api.md) - public JSON endpoints and Git HTTP surfaces.
- [Testing](./testing.md) - checks, test commands, and acceptance coverage.

## Run The Docs App

Octopus has a Fumadocs/Next.js docs app that renders this `docs/` tree. The
implementation follows the same stack shape as MailGate's `apps/docs` app,
while keeping deployment-specific Cloudflare wiring out for now.

```bash
pnpm dev:docs
```

Open:

```text
http://127.0.0.1:3004/
```

## Runbooks

- [Local Development](./runbooks/local-dev.md) - local server, wallet login,
  local storage, resets, and troubleshooting.
- [Deployment](./runbooks/deployment.md) - hosted/testnet checklist, Railway
  notes, Walrus modes, SEAL mode, and smoke tests.

## Reference

- [Environment Variables](./reference/env-vars.md) - canonical runtime
  variables by component.

## Spec And ADR Map

- [`specs/00-vision.md`](../specs/00-vision.md) - product thesis.
- [`specs/01-mvp-scope.md`](../specs/01-mvp-scope.md) - current MVP and
  deferred scope.
- [`specs/02-user-flows.md`](../specs/02-user-flows.md) - end-user flows.
- [`specs/03-architecture.md`](../specs/03-architecture.md) - original system
  architecture spec.
- [`specs/04-domain-model.md`](../specs/04-domain-model.md) - domain objects.
- [`specs/protocols/`](../specs/protocols/) - protocol contracts for auth,
  Git HTTP, Sui, Walrus, restore, and private repos.
- [`specs/acceptance/`](../specs/acceptance/) - user-observable acceptance
  behavior.
- [`specs/api/openapi.yaml`](../specs/api/openapi.yaml) - OpenAPI contract.
- [`adr/`](../adr/) - architecture decision records.

## Components Index

| Component | Workspace | Primary docs |
|---|---|---|
| Server | `apps/server` | [Architecture](./architecture.md), [API](./api.md), [Env vars](./reference/env-vars.md) |
| CLI | `apps/cli` | [CLI](./cli.md), [Quickstart](./quickstart.md) |
| Web wallet/login app | `apps/web` | [Quickstart](./quickstart.md), [Local dev](./runbooks/local-dev.md) |
| Shared schemas/helpers | `packages/shared` | [API](./api.md), [CLI](./cli.md) |
| Sui Move contracts | `contracts/sui` | [Architecture](./architecture.md), [`specs/protocols/sui-registry.md`](../specs/protocols/sui-registry.md) |
| Product/protocol specs | `specs` | [Spec map](#spec-and-adr-map) |
| Architecture decisions | `adr` | [Spec map](#spec-and-adr-map) |

## Documentation Conventions

- Product and protocol behavior should be updated in `specs/` first.
- Runtime instructions, operator notes, and troubleshooting belong in `docs/`.
- Architectural choices that constrain future implementation should become ADRs.
- Docs should prefer commands that work from the repository root unless a
  section explicitly says otherwise.
