# Tasks: Complete PR Lifecycle

## 1. Shared contracts and groundwork

- [x] 1.1 Add Zod schemas to `packages/shared/src/index.ts`: `mergePullRequestRequestSchema` (strategy enum, expectedHeadCommit, deleteBranch), `createPullRequestCommentRequestSchema` (body 1–10,000 chars), and a `pullRequestStatusSchema` covering `open|closed|merged`; rebuild shared (`pnpm --filter @ducnmm/octopus-shared build`)
- [x] 1.2 Verify `PullRequestStore` parsing tolerates unknown/missing fields (forward/backward compat per design D4); loosen if strict, and add a unit test loading a pre-change `version: 1` store file
- [x] 1.3 Add a startup git-version assertion (≥ 2.38 for `merge-tree --write-tree`) to config/env validation, and document in `docs/reference/env-vars.md` or deploy notes

## 2. Ref finalization pipeline extraction

- [x] 2.1 Extract the post-receive-pack finalization block from `apps/server/src/git.ts` (createPushArtifacts → anchorPushManifests → recordPushAttempt → indexRepository, with restoreRefs rollback) into a reusable `finalizeRefUpdate(...)` function
- [x] 2.2 Switch `git.ts` receive-pack handling to call `finalizeRefUpdate` and confirm existing push e2e tests still pass unchanged

## 3. PR store: state machine and comments

- [x] 3.1 Extend the `PullRequest` model in `apps/server/src/pull-requests.ts`: status `merged`, optional `closedAtMs`/`closedBy`/`mergedAtMs`/`mergedBy`/`mergeCommit`/`mergeStrategy`, and `comments` defaulting to `[]`
- [x] 3.2 Implement `closePullRequest` and `reopenPullRequest` (transition guards: merged is terminal; reopen requires both branches to exist and re-resolves head/base commits; bump `updatedAtMs`)
- [x] 3.3 Implement `addPullRequestComment` / `listPullRequestComments` (id, author attribution, chronological order, comments allowed in any status, bump `updatedAtMs`)
- [x] 3.4 Implement live head/base refresh on detail reads of open PRs (persist only when changed); skip refresh for closed/merged PRs
- [x] 3.5 Add status filtering to `listPullRequests` (`open|closed|merged|all`)
- [x] 3.6 Unit tests for transitions, refresh, comments, and filtering (including reopen-with-deleted-branch → error)

## 4. Merge engine

- [x] 4.1 Implement mergeability detection via `git merge-tree --write-tree` and expose `mergeable` + reason alongside `comparePullRequest` in the detail flow
- [x] 4.2 Implement `mergePullRequest` strategies: merge commit (`commit-tree` with two parents), squash (single parent, title/#number message), fast-forward (ancestor check), per design D2
- [x] 4.3 Enforce `expectedHeadCommit` stale-read check and compare-and-swap base ref update (`git update-ref` with expected old value), mapping failures to 409
- [x] 4.4 Route successful merges through `finalizeRefUpdate`; mark PR `merged` (with merge metadata) only after finalization succeeds; restore refs and keep PR open on failure
- [x] 4.5 Implement optional head-branch deletion in the same finalized ref batch, with refusal when head is the default branch or base of another open PR (merge still succeeds, response notes branch kept)
- [x] 4.6 Tests: each strategy, conflict rejection, stale head 409, CAS race 409, anchoring-failure rollback, branch-delete eligibility

## 5. REST API and service layer

- [x] 5.1 Add service/repository methods (`pull-request-service.ts`, `pull-request-repository.ts`) for merge, close, reopen, comments, and filtered list
- [x] 5.2 Add REST routes in `routes/pull-request-routes.ts`: `POST .../merge`, `POST .../close`, `POST .../reopen`, `GET/POST .../comments`, `?status=` on list — with auth rules (writer for merge; author-or-writer for close/reopen/comment; content-read for GETs) and status codes per specs (400/401/403/405/409)
- [x] 5.3 e2e tests covering the REST lifecycle: open → comment → close → reopen → merge (each strategy on fresh PRs), filtered list, and authorization failures

## 6. Web UI

- [x] 6.1 PR detail page (`views/pages.ts`): status badges for open/closed/merged, mergeability indicator, merge control with strategy selection + delete-branch checkbox, close/reopen buttons — all gated by viewer authorization
- [x] 6.2 Comment thread rendering (author, timestamp, chronological) plus comment form for authorized users
- [x] 6.3 Web POST form routes (`/:owner/:repo/pulls/:pull/merge|close|reopen|comments`) using existing session auth, redirecting back to the detail page with errors surfaced
- [x] 6.4 PR list page: default to open PRs with controls for closed/merged, status badges per row
- [x] 6.5 e2e tests for the web pages (actions visible only to authorized sessions, badge rendering, comment form round-trip)

## 7. CLI

- [x] 7.1 Add `pr list` (with `--status`) and `pr view` (detail incl. status, mergeability, comment count) to `apps/cli/src/program.ts`
- [x] 7.2 Add `pr merge` (fetch PR first, send its head commit as `expectedHeadCommit`; `--strategy`, `--delete-branch`), `pr close`, `pr reopen`, `pr comment --body`
- [x] 7.3 CLI unit tests for all new subcommands (mirroring the existing `pr create` test style)

## 8. Activity, docs, and verification

- [x] 8.1 Surface merge and close events in `repo-activity.ts` activity feed
- [x] 8.2 Update `specs/02-user-flows.md` with merge/close/reopen/comment flows and add acceptance notes under `specs/acceptance/`
- [x] 8.3 Run `pnpm check`, `pnpm test`, `pnpm build` across workspaces and fix fallout
