# Complete PR Lifecycle

## Why

Pull requests in Octopus can currently only be opened and viewed — there is no way to merge, close, reopen, or discuss them through any surface (REST, web UI, or CLI). A PR is created with `status: "open"` and stays that way forever; the detail page is read-only and the CLI has a single `pr create` subcommand. This makes the PR feature a dead end: contributors can propose changes but maintainers cannot land or reject them without dropping to raw git pushes, which bypasses the PR record entirely and leaves stale "open" PRs behind.

## What Changes

- Introduce a real PR state machine: `open → merged` (via merge) and `open → closed → open` (via close/reopen). Add `"merged"` to `PullRequestStatus` and stop treating `closedAt`/`mergedAt`-style metadata as nonexistent.
- Implement server-side merge with three strategies — merge commit, squash, and fast-forward — executed against the bare repo cache and routed through the same post-update pipeline as a git push (Sui ref anchoring + Walrus snapshot), so a merge is as durable and provable as a push.
- Add mergeability/conflict detection so the API, web UI, and CLI can tell users whether a PR can merge cleanly before they try.
- Refresh `headCommit`/`baseCommit` on read so PR diffs and merge decisions track the live branches instead of creation-time snapshots; bump `updatedAtMs` on every mutation.
- Add PR-level discussion comments (a flat conversation thread per PR) with create and list operations.
- Expose all of the above through:
  - REST: `PATCH`/merge/close/reopen/comment endpoints under `/v1/repos/:owner/:repo/pulls/:pull`.
  - Web UI: merge button (with strategy choice), close/reopen buttons, comment form, and status badges (open/closed/merged) on the PR detail and list pages; status filter on the list page.
  - CLI: `pr list`, `pr view`, `pr merge`, `pr close`, `pr reopen`, `pr comment` subcommands.
- Optional head-branch deletion after merge (explicit flag, never automatic).
- Out of scope (still deferred per `specs/01-mvp-scope.md`): review approvals/request-changes, inline diff comments, draft PRs, CI/status checks, auto-merge, labels/assignees/milestones.

## Capabilities

### New Capabilities

- `pull-request-lifecycle`: PR status model and transitions — close, reopen, merged terminal state, live head/base commit refresh, `updatedAtMs` semantics, status filtering on list surfaces, and authorization rules for each transition.
- `pull-request-merge`: merge strategies (merge commit, squash, fast-forward), mergeability/conflict detection, post-merge ref anchoring through the push pipeline (Sui manifest + Walrus snapshot), and optional head-branch deletion.
- `pull-request-comments`: PR-level discussion comments — creation, listing, author attribution, and rendering across REST, web UI, and CLI.

### Modified Capabilities

<!-- None of the existing openspec capabilities (login-visual-theme, server-module-architecture, server-quality-tooling, shadcn-setup) cover PR behavior; no requirement-level changes to them. -->

## Impact

- **Server**: `apps/server/src/pull-requests.ts` (state machine, merge, comments, store version bump), `routes/pull-request-routes.ts`, `services/pull-request-service.ts`, `repositories/pull-request-repository.ts`, `views/pages.ts` (PR detail/list pages gain actions), `git.ts` / `artifacts.ts` / `sui.ts` (reuse of the post-push anchoring pipeline for server-initiated ref updates), `repo-activity.ts` (merge/close events in the activity feed).
- **Shared**: `packages/shared/src/index.ts` gains Zod schemas for merge/close/reopen/comment requests (rebuild required for downstream packages).
- **CLI**: `apps/cli/src/program.ts` gains five `pr` subcommands.
- **Storage**: per-repo PR JSON store schema evolves (new fields: `mergedAtMs`, `closedAtMs`, `mergeCommit`, `mergeStrategy`, `mergedBy`/`closedBy`, comments). Needs a tolerant migration from `version: 1` files.
- **Specs**: `specs/02-user-flows.md` gains merge/close/comment flows; acceptance specs for the lifecycle.
- **Tests**: extend `apps/server/test/git-http.e2e.test.ts` (or a new PR e2e suite) and `apps/cli/src/program.test.ts`.
