# CLI Parity

## Why

The Octopus CLI covers the core forge loop (auth, repo create/connect, PR lifecycle) but lacks the everyday conveniences that make `gh` usable as a daily driver: you cannot discover repositories, clone one in a single step, fetch a PR's branch for local review, or read a PR's diff without opening the web UI. Every missing piece is already served by an existing REST endpoint or is a thin git wrapper, so the cost is low and the workflow payoff — especially "review a PR locally before merging it" — is high now that `complete-pr-lifecycle` adds `pr merge` to the CLI.

## What Changes

- Add `octopus repo list` — list repositories visible to the caller (public plus authorized private), backed by the existing `GET /v1/repos` endpoint.
- Add `octopus repo clone <owner/name> [directory]` — one-step clone: resolves the remote URL, runs `git clone` with the delegate auth header (required for private repos), then applies the same remote/header configuration as `repo connect` inside the new working copy.
- Add `octopus pr checkout <repo> <number>` — fetch the PR's head branch from the remote and switch to a local branch tracking it, using `headRef` from the existing PR detail endpoint.
- Add `octopus pr diff <repo> <number>` — print the PR's unified diff to stdout, using the `patch`/`patchTruncated` fields the PR detail endpoint (`readWithComparison`) already returns; warn on stderr when the patch was truncated by the server's size limit.
- No server or shared-package changes are required; this change is CLI-only plumbing over existing surfaces.
- Out of scope: PR reviews/approvals, draft PRs, issues, releases, repo delete/rename/visibility edit, fork, code-search CLI (all deferred per `specs/01-mvp-scope.md`); any new REST endpoints.

## Capabilities

### New Capabilities

- `cli-repo-discovery`: listing repositories visible to the authenticated (or anonymous) CLI user, and cloning a repository in one step with authentication and remote configuration applied.
- `cli-pr-review-workflow`: working with an open PR locally from the CLI — checking out the PR head branch and viewing the PR diff.

### Modified Capabilities

<!-- No requirement-level changes to existing capabilities. The pull-request-* capabilities introduced by complete-pr-lifecycle are consumed read-only (PR detail endpoint); their requirements do not change. -->

## Impact

- **CLI**: `apps/cli/src/program.ts` gains four subcommands (`repo list`, `repo clone`, `pr checkout`, `pr diff`); reuses `configureRemote`, `authHeaders`, `requestJson`, and the existing `PullRequestDetailResponse` type.
- **Server**: none (read-only consumption of `GET /v1/repos` and `GET /v1/repos/:owner/:repo/pulls/:pull`).
- **Shared package**: none.
- **Tests**: `apps/cli/src/program.test.ts` gains coverage for the four subcommands (mocked fetch + git runner).
- **Docs**: CLI reference/README command list.
- **Dependency**: builds on the `complete-pr-lifecycle` change (PR detail response shape, `pr` command group structure). That change should land first, or this one must be implemented on top of its branch.
