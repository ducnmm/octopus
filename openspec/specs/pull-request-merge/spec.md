# pull-request-merge

## ADDED Requirements

### Requirement: Merge strategies
The server SHALL support merging an open PR with one of three strategies: `merge` (a merge commit with the base and head commits as parents), `squash` (a single new commit on base containing the combined tree, with a message derived from the PR title and number), and `fast-forward` (moving the base ref to the head commit, permitted only when the base commit is an ancestor of the head commit and the merge base equals the base commit). Merging SHALL NOT require a working-tree checkout.

#### Scenario: Merge-commit strategy
- **WHEN** a writer merges an open, conflict-free PR with strategy `merge`
- **THEN** the base branch points to a new commit with two parents (previous base commit, head commit), the PR status becomes `merged`, and `mergeCommit`, `mergeStrategy`, `mergedAtMs`, `mergedBy` are recorded

#### Scenario: Squash strategy
- **WHEN** a writer merges an open, conflict-free PR with strategy `squash`
- **THEN** the base branch points to a new single-parent commit whose tree equals the merged tree and whose message contains the PR title and number

#### Scenario: Fast-forward strategy on a diverged base
- **WHEN** a writer requests strategy `fast-forward` but the base branch has commits not contained in the head branch
- **THEN** the server rejects the merge with HTTP 409 and no refs change

### Requirement: Mergeability detection
For an open PR, the server SHALL compute whether the head can merge into the base without conflicts and SHALL expose this as part of the PR detail response (`mergeable` plus a reason when not mergeable). The detection SHALL use the same merge machinery as the merge operation itself.

#### Scenario: Conflicting PR reported as not mergeable
- **WHEN** the head and base branches modify the same lines incompatibly and a client fetches the PR detail
- **THEN** the response reports `mergeable: false` with a conflict reason, and the web detail page displays a conflict warning instead of an enabled merge button

#### Scenario: Merge attempt on a conflicting PR
- **WHEN** a writer attempts to merge a PR that has conflicts
- **THEN** the server rejects the merge with HTTP 409 and no refs or PR state change

### Requirement: Merge durability through the push pipeline
A successful merge SHALL be finalized through the same pipeline as a git push: bundle artifacts created, manifests anchored on Sui, and the push-attempt record written. If anchoring fails, the server SHALL restore the repository refs to their pre-merge state and SHALL NOT mark the PR as merged.

#### Scenario: Anchoring failure rolls back the merge
- **WHEN** a merge's artifact creation or Sui anchoring fails
- **THEN** the base branch is restored to its pre-merge commit, the PR remains `open`, and the merge request fails with an error

#### Scenario: Successful merge is anchored
- **WHEN** a merge completes successfully
- **THEN** a ref manifest covering the base branch update exists and is anchored, equivalent to the manifest a push of the same ref change would have produced

### Requirement: Stale-head and concurrency protection
A merge request SHALL include the head commit the client reviewed (`expectedHeadCommit`); the server SHALL reject the merge with HTTP 409 if the live head commit differs. The base ref update SHALL be performed as a compare-and-swap against the expected previous base commit, and a concurrent change to the base ref SHALL cause the merge to fail with HTTP 409 without partial state.

#### Scenario: Head moved after review
- **WHEN** a force-push changes the head branch after a client fetched the PR and the client submits a merge with the old `expectedHeadCommit`
- **THEN** the server rejects the merge with HTTP 409 and the PR remains open

#### Scenario: Concurrent push to base during merge
- **WHEN** the base ref changes between the merge's mergeability check and its ref update
- **THEN** the compare-and-swap fails, the merge returns HTTP 409, and no commit is left on the base branch

### Requirement: Merge surfaces
Merge SHALL be available via REST (`POST /v1/repos/:owner/:repo/pulls/:pull/merge` accepting `strategy`, `expectedHeadCommit`, and optional `deleteBranch`), via the web PR detail page (merge control with strategy selection, shown only to repository writers on mergeable open PRs), and via the CLI (`pr merge <owner/repo> <number> [--strategy] [--delete-branch]`, which SHALL fetch the current PR and send its head commit as `expectedHeadCommit`).

#### Scenario: Merge via CLI
- **WHEN** a writer runs `octopus pr merge owner/repo 4 --strategy squash`
- **THEN** the CLI fetches PR 4, submits the merge with the fetched head commit, and prints the merge commit and resulting status

#### Scenario: Merge attempted on a closed PR
- **WHEN** a writer submits a merge request for a PR whose status is `closed` or `merged`
- **THEN** the server rejects it with HTTP 405

### Requirement: Optional head branch deletion
When a merge request sets `deleteBranch: true`, the server SHALL delete the head branch from the repository cache in the same finalized ref update as the base branch change. Ref deletions SHALL follow the same registry semantics as push deletions (the existing pipeline does not anchor deletions; the registry retains the last anchored commit for the ref). The server SHALL refuse deletion (without failing the merge) when the head branch is the repository default branch or is the base of another open PR.

#### Scenario: Branch deleted with merge
- **WHEN** a writer merges with `deleteBranch: true` and the head branch is eligible for deletion
- **THEN** after the merge the head branch no longer exists in the repository cache and the base branch update is anchored

#### Scenario: Protected head branch is preserved
- **WHEN** a writer merges with `deleteBranch: true` but the head branch is the repository default branch
- **THEN** the merge succeeds and the head branch is not deleted, and the response indicates the branch was kept
