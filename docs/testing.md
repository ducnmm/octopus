---
title: Testing
description: Check commands, package-level test commands, and acceptance coverage.
---

# Testing

Octopus has TypeScript package checks, Vitest tests, Git HTTP end-to-end tests,
and Move unit tests.

## Main Commands

From the repository root:

```bash
pnpm check
pnpm build
pnpm test
```

Move contracts:

```bash
cd contracts/sui
sui move test
```

## Package-Level Commands

Server:

```bash
pnpm --filter @octopus/server check
pnpm --filter @octopus/server test
```

CLI:

```bash
pnpm --filter @ducnmm/octopus check
pnpm --filter @ducnmm/octopus test
```

Web:

```bash
pnpm --filter @octopus/web check
pnpm --filter @octopus/web test
```

Shared package:

```bash
pnpm --filter @ducnmm/octopus-shared build
```

## Current Coverage Areas

| Area | Tests |
|---|---|
| CLI command behavior | `apps/cli/src/program.test.ts` |
| Git HTTP push/clone/restore | `apps/server/test/git-http.e2e.test.ts` |
| Walrus local/relay paths | `apps/server/test/walrus.test.ts`, `apps/server/test/walrus-relay.test.ts` |
| SEAL/private encryption behavior | `apps/server/test/seal.test.ts` |
| Web login params | `apps/web/src/login-params.test.ts` |
| Move account/registry behavior | `contracts/sui/sources/*.move` through `sui move test` |

## Acceptance Map

The acceptance docs in `specs/acceptance/` describe the user-observable flows
that tests and demos should preserve:

- [`auth-login.md`](../specs/acceptance/auth-login.md)
- [`repo-create.md`](../specs/acceptance/repo-create.md)
- [`push-and-anchor.md`](../specs/acceptance/push-and-anchor.md)
- [`restore-from-walrus-sui.md`](../specs/acceptance/restore-from-walrus-sui.md)

When adding a feature, update the relevant spec or acceptance file first, then
add tests that exercise the behavior.

## Manual Demo Checklist

1. Start server and web app.
2. Run `octopus auth login`.
3. Create a public repository.
4. Connect a Git remote.
5. Push `main`.
6. View files and commits in the web UI.
7. List manifests.
8. Delete `data/repos/<owner>/<repo>.git`.
9. Restore the repo.
10. Clone and compare the restored commit hash with the original.

## CI Expectations

A healthy change should pass:

```bash
pnpm check
pnpm build
pnpm test
cd contracts/sui && sui move test
```

If a tool is unavailable locally, note the missing prerequisite in the PR or
handoff notes.
