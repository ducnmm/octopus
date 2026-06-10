# CLI Parity — Tasks

## 1. Preconditions

- [ ] 1.1 Verify the `complete-pr-lifecycle` CLI work (`pr` command group, `fetchPullRequestDetail`, `PullRequestDetailResponse`) is present on the working branch; rebase this change onto it if not

## 2. repo list

- [ ] 2.1 Add `repo list` subcommand in `apps/cli/src/program.ts` calling `GET /v1/repos` with `authHeaders`, printing `owner/name (visibility)` per repo and a friendly empty-state message
- [ ] 2.2 Add `--owner <owner>` client-side filter
- [ ] 2.3 Tests in `apps/cli/src/program.test.ts`: logged-in list, owner filter, empty list (mocked fetch)

## 3. repo clone

- [ ] 3.1 Extract the auth-header value construction from `configureRemote` so clone and connect mint the git-scoped token the same way
- [ ] 3.2 Add `repo clone <owner/name> [directory]` subcommand: resolve remote URL, run `git clone` with `-c http.<url>.extraHeader=…` when logged in (plain clone when logged out), then run `configureRemote` inside the clone when logged in
- [ ] 3.3 Add the logged-out private-repo failure hint suggesting `octopus auth login`
- [ ] 3.4 Tests: logged-in clone (asserts extraHeader flag and post-clone remote config), anonymous public clone, explicit target directory, clone failure passthrough

## 4. pr checkout

- [ ] 4.1 Add `pr checkout <owner/name> <number>` subcommand with `--remote` (default `origin`) and `--branch` options: fetch PR detail, `git fetch <remote> +<headRef>:refs/remotes/<remote>/<short>`, then `git switch` (create-with-track when the local branch is new, switch + `git merge --ff-only` when it exists)
- [ ] 4.2 Wrap fetch failure for a missing head branch with an error naming the branch
- [ ] 4.3 Tests: first checkout creates tracking branch, re-checkout fast-forwards, missing head branch error, invalid PR number rejection

## 5. pr diff

- [ ] 5.1 Extend the CLI `PullRequestDetailResponse.comparison` type with `patch: string` and `patchTruncated: boolean`
- [ ] 5.2 Add `pr diff <owner/name> <number>` subcommand printing `comparison.patch` verbatim to stdout and a truncation warning to stderr when `patchTruncated` is true
- [ ] 5.3 Tests: patch printed to stdout untouched, truncation warning on stderr, not-found PR surfaces server error non-zero

## 6. Verification & docs

- [ ] 6.1 Run `pnpm check` and `pnpm --filter @ducnmm/octopus test`
- [ ] 6.2 Update the CLI command list in the README / docs CLI reference with the four new subcommands
- [ ] 6.3 Manual smoke test against the local dev server (`pnpm dev:server`): list, clone public, clone private, checkout an open PR, diff it
