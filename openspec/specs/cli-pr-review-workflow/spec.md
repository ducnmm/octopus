# cli-pr-review-workflow Specification

## Purpose
TBD - created by archiving change cli-parity. Update Purpose after archive.
## Requirements
### Requirement: Check out a pull request head branch locally

The CLI SHALL provide a `pr checkout <owner/name> <number>` command that, when
run inside a git working copy, fetches the pull request's head branch from the
configured remote and switches to a local branch tracking it. The local branch
name SHALL default to the short head branch name and SHALL be overridable via
a `--branch <name>` option; the remote name SHALL default to `origin` and be
overridable via `--remote <name>`. Re-running the command for an existing
local branch SHALL fast-forward it to the fetched head and MUST NOT rewrite
local commits; a non-fast-forward update SHALL fail with an error.

#### Scenario: First checkout of an open pull request

- **WHEN** a user runs `octopus pr checkout alice/website 4` inside a clone of
  `alice/website` and no local branch matches the PR head
- **THEN** the CLI fetches the PR's `headRef` from the remote and creates a
  local tracking branch named after the short head branch, leaving the
  working copy switched to it

#### Scenario: Re-checkout updates the existing branch

- **WHEN** the PR head has new commits and the user re-runs
  `octopus pr checkout alice/website 4` with the local branch already present
- **THEN** the CLI fetches the head ref and fast-forwards the local branch to
  it

#### Scenario: Head branch no longer exists

- **WHEN** the PR's head branch has been deleted on the server (for example
  after a merge with branch deletion) and the user runs `pr checkout`
- **THEN** the command fails with an error that names the missing head branch

### Requirement: View a pull request diff from the CLI

The CLI SHALL provide a `pr diff <owner/name> <number>` command that fetches
the pull request detail from `GET /v1/repos/:owner/:repo/pulls/:pull` and
writes the server-computed unified diff (`comparison.patch`) to stdout
unmodified. When the server reports the patch as truncated
(`comparison.patchTruncated` is true), the CLI SHALL print a truncation
warning to stderr while keeping stdout limited to the patch content.

#### Scenario: Print a pull request diff

- **WHEN** a user runs `octopus pr diff alice/website 4`
- **THEN** the CLI prints the unified diff returned by the PR detail endpoint
  to stdout

#### Scenario: Truncated diff warns on stderr

- **WHEN** the server returns `patchTruncated: true` for the pull request
- **THEN** the CLI prints the partial patch to stdout and a warning to stderr
  indicating the diff was truncated by the server

#### Scenario: Pull request does not exist

- **WHEN** a user runs `octopus pr diff alice/website 999` and the server
  returns a not-found error
- **THEN** the command exits non-zero and surfaces the server's error message

