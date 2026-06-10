# Acceptance: Pull Request Lifecycle

## Scenario: Merge And Anchor

Given a public repo with branches `main` and `feature` (diverged)
And an open pull request `feature -> main`
And a user with write permission
When they run:

```bash
octopus pr merge ducnmm/demo 1 --strategy merge --delete-branch
```

Then:

- the server verifies the reviewed head commit still matches the live branch
- the server checks the merge is conflict-free with `git merge-tree`
- the server creates a two-parent merge commit without a working tree
- the base ref moves via compare-and-swap (concurrent change → 409)
- the ref change is finalized through the push pipeline: Walrus artifact +
  Sui `PackManifest`, with cache-ref rollback on failure
- the pull request becomes `merged` with merge commit, strategy, actor, time
- the head branch is deleted from the repo cache (kept when it is the
  default branch or the base of another open PR)

## Scenario: Close, Reopen, Comment

Given an open pull request
When the author (without write access) closes it
Then the status becomes `closed` with `closedBy`/`closedAtMs` recorded

When the author reopens it and both branches still exist
Then the status returns to `open` with re-resolved head/base commits

When the head branch was deleted before reopening
Then the reopen fails with 409 and the pull request stays `closed`

When the author or a writer posts a comment (1–10,000 chars)
Then it is appended to the conversation in chronological order on any status

## Scenario: Rejections

- merging a `closed` or `merged` pull request → 405
- merging with a stale `expectedHeadCommit` → 409
- merging with conflicts → 409, no refs change
- `fast-forward` strategy on a diverged base → 409
- merge/close/comment by an account that is neither author nor writer → 403
- unauthenticated transition requests → 401

## Scenario: Status Filtering

Given pull requests in `open`, `closed`, and `merged` states
When listing with `?status=<open|closed|merged|all>` (REST), `--status` (CLI),
or the web list page filter
Then only matching pull requests are returned; the web list defaults to open,
the REST API defaults to all (backward compatible)
