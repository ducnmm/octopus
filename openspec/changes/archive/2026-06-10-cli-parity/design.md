# CLI Parity — Design

## Context

The CLI (`apps/cli/src/program.ts`, commander-based) talks to the server via
`requestJson` with short-lived REST delegate tokens (`REST_AUTH_EXPIRES_IN_MS`
= 5 min) and configures git remotes via `configureRemote`, which sets a
repo-local `http.<remoteUrl>.extraHeader` containing a long-lived git-scoped
delegate token (`GIT_AUTH_EXPIRES_IN_MS` = 30 days). All four new commands sit
on top of surfaces that already exist:

- `GET /v1/repos` returns `{ repos }` — every repo visible to the caller
  (public for anonymous, plus private repos the delegate is authorized for).
- `GET /v1/repos/:owner/:repo/pulls/:pull` (`readWithComparison`) returns the
  PR, its `comparison` (including `patch` and `patchTruncated`, capped by the
  server's `PATCH_LIMIT_BYTES`), and `mergeability`.
- Octopus PRs are same-repo branch PRs (no forks), so a PR's `headRef` is
  always a `refs/heads/*` ref on the one remote.

This change depends on `complete-pr-lifecycle` (the `pr` command group with
`fetchPullRequestDetail`, and the comparison response shape) and must be built
on top of it.

## Goals / Non-Goals

**Goals:**

- `repo list`, `repo clone`, `pr checkout`, `pr diff` in the CLI with the same
  option conventions as existing commands (`--server`, `-d/--dev`).
- Zero server and zero shared-package changes.
- Anonymous use where the server allows it (public `repo list`, public
  `repo clone`, public-repo `pr diff`).

**Non-Goals:**

- New REST endpoints, PR reviews, issues, fork support, repo mutation commands
  (delete/rename/visibility), code-search CLI.
- Client-side diff computation (the server's patch is authoritative, including
  its truncation limit).
- Credential-helper or token-refresh redesign; clone reuses the existing
  30-day extraHeader mechanism as-is.

## Decisions

### 1. `repo clone` = `git clone -c http.<url>.extraHeader=…` + `configureRemote` in the result

`octopus repo clone <owner/name> [directory]` resolves the remote URL exactly
like `repo connect`, then:

1. If logged in, mint a git-scoped token and pass the auth header via
   `git clone -c http.<remoteUrl>.extraHeader="<header>" <url> [directory]`
   so private clones work in one step. If not logged in, run a plain
   `git clone` (public repos work anonymously).
2. After a successful clone, run the existing `configureRemote` inside the new
   working copy (when logged in) so subsequent fetch/push carry the persisted
   header — identical end-state to `repo connect`.

*Alternative considered:* embedding the token in the clone URL
(`https://token@…`). Rejected: leaks the token into `.git/config` remote URL,
shell history, and error output; the extraHeader pattern is already the
project's convention.

*Alternative considered:* a git credential helper. Rejected as a larger
redesign explicitly out of scope; the extraHeader mechanism is what `connect`
already uses.

### 2. `pr checkout` fetches `headRef` into a local branch via one `git fetch` refspec

`octopus pr checkout <owner/name> <number> [--remote origin] [--branch <name>]`:

1. Fetch PR detail (existing `fetchPullRequestDetail`) and take
   `pullRequest.headRef`.
2. Derive the local branch name from the short head branch (strip
   `refs/heads/`), overridable with `--branch`.
3. Run `git fetch <remote> +<headRef>:refs/remotes/<remote>/<short>` then
   `git switch` — `git switch -c <local> --track <remote>/<short>` when the
   local branch doesn't exist, plain `git switch <local>` followed by
   `git merge --ff-only <remote>/<short>` when it does (mirrors `gh pr
   checkout` semantics: re-running updates the branch, never rewrites local
   work; a non-fast-forward fails loudly).
4. Run from `context.cwd`; the command requires being inside a clone whose
   `<remote>` points at the Octopus server. If the fetch is rejected (e.g.
   merged/closed PR whose head branch was deleted), surface git's error with a
   hint that the head branch no longer exists.

*Alternative considered:* fetching the head commit SHA into a detached HEAD.
Rejected: a tracking branch is what users need to push follow-up commits to
the PR.

### 3. `pr diff` prints the server's patch verbatim

`octopus pr diff <owner/name> <number>` reuses `fetchPullRequestDetail`,
extends the CLI's local `PullRequestDetailResponse.comparison` type with the
`patch: string` and `patchTruncated: boolean` fields the server already
returns, and writes `patch` to stdout untouched (pipe-friendly, applies with
`git apply`). When `patchTruncated` is true, print a warning to **stderr** so
stdout stays a valid patch.

*Alternative considered:* computing the diff locally via `git diff` after a
fetch. Rejected: requires a clone and network fetch; the server already
computes merge-base-anchored patches consistently with the web UI.

### 4. `repo list` is a thin formatter over `GET /v1/repos`

`octopus repo list [--owner <owner>]` calls `GET /v1/repos` with
`authHeaders` (which degrade to no header when logged out), optionally
filters client-side by owner, and prints one repo per line in the existing
`writeLine` style (`owner/name (visibility)`). No new query parameters —
filtering stays client-side to keep the server untouched.

### 5. Command placement and shared plumbing

All four commands live in `program.ts` alongside their groups, reusing
`serverUrlFromOptions`, `splitRepo`, `parsePullNumber`, `authHeaders`,
`requestJson`, `runGit`, and `configureRemote`. No new modules unless
`program.ts` growth forces a mechanical split (out of scope to restructure).

## Risks / Trade-offs

- [Clone of a private repo while logged out fails with a server 401/404] →
  Detect the unauthenticated case up front and append a hint to run
  `octopus auth login`.
- [`pr checkout` on a deleted head branch (post-merge `--delete-branch`)] →
  git fetch fails; wrap the error with a message naming the missing branch.
- [`patchTruncated` diffs are incomplete] → explicit stderr warning including
  the suggestion to fetch and diff locally; never silently truncate.
- [`repo clone` into an existing directory] → let `git clone` fail naturally
  and pass its error through; no pre-checks that could race.
- [Tests must not shell out to a real server/git] → `program.test.ts` already
  injects `context.fetch` and runs against temp dirs; follow the established
  mocking pattern, adding real-git integration only where the existing suite
  already does so.
- [This change races with `complete-pr-lifecycle`] → declared dependency;
  implement on top of that branch and archive after it lands.

## Open Questions

- None blocking. (Whether `repo list` should eventually get server-side
  pagination is deferred until repo counts make it matter.)
