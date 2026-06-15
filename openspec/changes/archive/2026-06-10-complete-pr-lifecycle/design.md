# Design: Complete PR Lifecycle

## Context

PRs live in a per-repo JSON store (`data/pull-requests/{owner}/{repo}.json`, `version: 1`) managed by `apps/server/src/pull-requests.ts`. Only four operations exist (`listPullRequests`, `readPullRequest`, `createPullRequest`, `comparePullRequest`), surfaced through `routes/pull-request-routes.ts` → `services/pull-request-service.ts` → `repositories/pull-request-repository.ts`. Status is effectively always `"open"`; `headCommit`/`baseCommit` are frozen at creation; the web detail page is read-only; the CLI has only `pr create`.

The critical architectural constraint is ADR 0001 (server-as-cache): the bare repos under `data/repos` are rebuildable cache, and durable ref state lives in Sui manifests + Walrus bundle artifacts. Today the only writer of refs is `git http-backend` (receive-pack), and `git.ts:307-380` finalizes a successful push by diffing before/after refs, calling `createPushArtifacts(...)` → `anchorPushManifests(...)` → `recordPushAttempt(...)`, and rolling refs back via `restoreRefs(...)` if anchoring fails. A server-side merge is a second writer of refs and MUST go through the same finalization or merged commits would exist only in the disposable cache.

The PR JSON store itself remains cache-tier (rebuildable, not anchored) — consistent with `specs/03-architecture.md`, which lists PR/comment archival as a future concern.

## Goals / Non-Goals

**Goals:**

- Full open → merged / open ↔ closed state machine with authorization on each transition.
- Server-side merge (merge commit, squash, fast-forward) that is exactly as durable as a push: anchored on Sui, snapshotted to Walrus, rolled back atomically on anchoring failure.
- Mergeability (conflict) detection exposed before merge is attempted.
- Live head/base commit refresh so diffs and merges always reflect current branches.
- Flat PR conversation comments.
- Parity across REST, web UI, and CLI for every new operation.
- Tolerant migration of existing `version: 1` PR store files.

**Non-Goals:**

- Review approvals / request-changes, inline diff comments, draft PRs, CI status checks, auto-merge, labels/assignees/milestones (deferred per `specs/01-mvp-scope.md`).
- Anchoring PR metadata or comments on-chain (PR store stays cache-tier).
- Rebase-merge strategy and "update branch" (rebase head onto base) — merge-commit covers the integration need; rebase rewrites history and adds force-push semantics we don't want yet.
- Branch protection rules.

## Decisions

### D1: Extract a shared ref-finalization pipeline; merge goes through it

Extract the post-receive-pack block in `git.ts` (artifact creation → anchoring → push-attempt record → index refresh → ref rollback on failure) into a reusable `finalizeRefUpdate({ config, repoPath, owner, repo, beforeRefs, afterRefs, auth, repoState })` (new module or exported from `artifacts.ts`). Both `git.ts` and the merge service call it.

*Why over an internal-push simulation (spawning `git push` to ourselves):* same durability guarantees without HTTP self-calls, auth token round-trips, or CGI overhead; and the rollback semantics are already proven in this code path. *Alternative considered:* having merge write refs and letting the next user push anchor them — rejected, it violates ADR 0003 (Move anchors refs) by leaving the merged base ref unanchored for an unbounded window.

### D2: Merge mechanics — temp object work, single ref compare-and-swap

Merging never checks out a worktree. All strategies operate on the bare repo:

- **Mergeability check**: `git merge-tree --write-tree <base> <head>` (Git ≥ 2.38). Exit status / conflict markers indicate conflicts without touching refs. Exposed as `mergeable: boolean` + `mergeStateReason` on the PR detail response, computed alongside `comparePullRequest`.
- **merge** (merge commit): use the `merge-tree`-produced tree, then `git commit-tree <tree> -p <baseCommit> -p <headCommit> -m "Merge pull request #N ..."`. Committer is the server; author recorded as the merging delegate's wallet identity (name = wallet address or namespace, deterministic email like `<wallet>@octopus.local`).
- **squash**: `git merge-tree` tree + `git commit-tree <tree> -p <baseCommit>` with a message summarizing the PR (`<title> (#N)` + body).
- **fast-forward**: only when `merge-base(base, head) == baseCommit`; ref moves to `headCommit`, no new commit.
- **Ref update**: `git update-ref refs/heads/<base> <newCommit> <expectedOldCommit>` — the compare-and-swap `<expectedOldCommit>` guard makes concurrent merges/pushes to the same base fail cleanly with a 409 instead of silently clobbering.

*Why `merge-tree` over a temporary clone + real `git merge`:* no working tree, no temp-dir lifecycle, conflict detection and merge use the same machinery so they cannot disagree. Requires Git ≥ 2.38 on the server image — acceptable; document in env/deploy notes.

### D3: Stale-read protection on merge requests

Merge requests carry the `headCommit` the client saw (`expectedHeadCommit`). If the live head no longer matches, reject with 409 ("head moved, re-review"). The web form embeds it as a hidden field; the CLI fetches the PR first. This prevents merging commits nobody reviewed after a force-push.

### D4: State machine and store evolution

```
open --merge--> merged   (terminal)
open --close--> closed --reopen--> open
```

- `PullRequestStatus` becomes `"open" | "closed" | "merged"`.
- New optional fields: `closedAtMs`, `closedBy`, `mergedAtMs`, `mergedBy`, `mergeCommit`, `mergeStrategy`, `comments: PullRequestComment[]` (`{ id, authorAccountId, authorWalletAddress, body, createdAtMs }`).
- Store stays `version: 1` with additive optional fields; the Zod/store reader defaults `comments` to `[]` and leaves merge/close metadata undefined. No file rewrite needed — old files parse as-is. (A version bump is reserved for a breaking shape change; this is purely additive.)
- Reopen is allowed only from `closed`, and only if base and head branches still exist; it re-resolves `headCommit`/`baseCommit`. Merged is terminal.
- Transitions and comments require: PR author **or** repo writer for close/reopen/comment; repo writer for merge. All require delegate auth (same `canWriteRepo` machinery as push for the writer check).
- On every read (`readPullRequest` for detail), if status is `open`, refresh `headCommit`/`baseCommit` from live refs and persist if changed (bumping `updatedAtMs`). List reads stay cheap (no refresh) — staleness on the list page is acceptable.

### D5: API shape

Under `/v1/repos/:owner/:repo/pulls/:pull`:

- `POST .../merge` `{ strategy: "merge"|"squash"|"fast-forward", expectedHeadCommit, deleteBranch?: boolean }` → `{ pullRequest, mergeCommit }`; 409 on conflict/stale/CAS failure, 405 if not open.
- `POST .../close`, `POST .../reopen` → `{ pullRequest }`.
- `GET .../comments` → `{ comments }`; `POST .../comments` `{ body }` (1–10,000 chars) → `201 { comment }`.
- `GET /v1/repos/:owner/:repo/pulls?status=open|closed|merged|all` (default `open` for web list page, `all` for bare REST list — keeps existing REST behavior backward-compatible).
- Web HTML actions are POST forms (`/:owner/:repo/pulls/:pull/merge|close|reopen|comments`) reusing the session-cookie auth that the create form already uses.

Request schemas live in `packages/shared` (`mergePullRequestRequestSchema`, `createPullRequestCommentRequestSchema`, …) so CLI and server stay in lockstep.

### D6: CLI subcommands

`pr list <owner/repo> [--status]`, `pr view <owner/repo> <number>`, `pr merge <owner/repo> <number> [--strategy] [--delete-branch]`, `pr close`, `pr reopen`, `pr comment <owner/repo> <number> --body <text>`. `pr merge` fetches the PR first and sends its `headCommit` as `expectedHeadCommit` (D3).

### D7: Branch deletion after merge

`deleteBranch: true` deletes `refs/heads/<head>` from the bare repo cache in the same `finalizeRefUpdate` call as the base update. Refused if the head branch is the repo default branch or has another open PR targeting it as base.

**Limitation discovered during implementation:** the anchoring pipeline has no notion of ref deletions — `changedRefs` in `artifacts.ts` only diffs the after-refs, so deletions produce no manifest and the registry keeps the last anchored commit for the deleted ref. This is pre-existing behavior: a plain `git push origin :branch` has exactly the same effect today. Anchoring deletions needs deletion manifests plus Move contract support (a `remove_ref` entry) and is deferred to a follow-up change. Until then, head-branch deletion is a cache-level cleanup consistent with push deletions, and a restore from durable storage may resurrect the deleted branch.

## Risks / Trade-offs

- [Anchoring failure mid-merge leaves base ref moved in cache] → reuse the existing rollback: `finalizeRefUpdate` restores `beforeRefs` on anchoring failure, and the PR record is only marked `merged` after finalization succeeds. PR store write failure after successful anchoring is logged and self-heals on next detail read (status recomputed as merged if `headCommit` is an ancestor of base — cheap `git merge-ancestor` check for open PRs).
- [Concurrent merge/push race on the same base ref] → `update-ref` compare-and-swap (D2) turns races into a 409; client retries after re-reviewing.
- [Git < 2.38 lacks `merge-tree --write-tree`] → assert git version at startup when feature enabled (config validation already exists per server-quality-tooling spec); Dockerfile base image pins a sufficient git.
- [Refresh-on-read writes to the store during GET] → only when commits actually changed; per-repo store writes are already serialized through the existing store read/write helper. Accept the mild GET side effect; it keeps the model simple versus a background refresher.
- [`comments` array unbounded in one JSON file] → cap comment body at 10,000 chars; volume is expected to be low pre-review-system. Revisit storage when inline reviews land.
- [Web POST forms need CSRF consideration] → reuse whatever the existing create-PR form does (session cookie + same-site); no new auth surface invented.

## Migration Plan

1. Ship shared schemas first (`packages/shared`), rebuild, then server, then CLI (CLI against an old server gets clean 404s on new endpoints — acceptable).
2. Existing PR store files parse unchanged (additive optional fields). No data migration step.
3. Rollback = deploy previous server image; new fields in store files are ignored by old readers only if old Zod schema is non-strict — verify `PullRequestStore` parsing is tolerant of unknown fields before shipping; if it is strict, loosen it in this change as a forward-compat fix.

## Open Questions

- Should merge be allowed when the indexer/Sui state is non-authoritative (testnet mode, RPC flake)? Current push path returns 503 in that case; merge will mirror push behavior (503) for consistency.
- Squash author identity: wallet-derived author vs. preserving the head commit's author with the merger as committer. Leaning wallet-derived merger as committer + original head author preserved when all head commits share one author; otherwise merger. Decide during implementation; not contract-level.
