# pull-request-lifecycle

## ADDED Requirements

### Requirement: PR status model
A pull request SHALL have exactly one status from the set `open`, `closed`, `merged`. The only permitted transitions SHALL be `open → merged` (via merge), `open → closed` (via close), and `closed → open` (via reopen). `merged` SHALL be terminal.

#### Scenario: Merged PR cannot be reopened or closed
- **WHEN** a client requests close or reopen on a PR whose status is `merged`
- **THEN** the server rejects the request with HTTP 405 and the PR record is unchanged

#### Scenario: Closing an open PR
- **WHEN** an authorized actor closes an open PR
- **THEN** the PR status becomes `closed`, `closedAtMs` and `closedBy` are recorded, and `updatedAtMs` is updated

#### Scenario: Reopening a closed PR
- **WHEN** an authorized actor reopens a closed PR and both base and head branches still exist
- **THEN** the PR status becomes `open`, `headCommit` and `baseCommit` are re-resolved from the live branches, and `updatedAtMs` is updated

#### Scenario: Reopening fails when a branch is gone
- **WHEN** an actor reopens a closed PR whose head branch no longer exists in the repository
- **THEN** the server rejects the request with HTTP 409 and the PR remains `closed`

### Requirement: Transition authorization
Close, reopen, and comment SHALL be permitted only to the PR author or an account with repository write access. Merge SHALL be permitted only to an account with repository write access. All transition requests SHALL carry valid delegate authentication (REST/CLI) or a valid web session (web UI).

#### Scenario: PR author closes own PR without write access
- **WHEN** the PR author, who has no repository write access, requests close on their open PR
- **THEN** the request succeeds and the PR becomes `closed`

#### Scenario: Non-author without write access cannot close
- **WHEN** an authenticated account that is neither the PR author nor a repository writer requests close
- **THEN** the server rejects the request with HTTP 403

#### Scenario: Unauthenticated transition request
- **WHEN** a transition request arrives without valid authentication
- **THEN** the server rejects it with HTTP 401

### Requirement: Live head and base commit refresh
When serving a PR detail read for an `open` PR, the server SHALL resolve the current commits of the head and base branches; if they differ from the stored `headCommit`/`baseCommit`, the server SHALL persist the new values and update `updatedAtMs`. The comparison (diff, commits, file stats) SHALL be computed against the refreshed commits.

#### Scenario: Head branch advanced since PR creation
- **WHEN** new commits were pushed to the head branch after the PR was created and a client fetches the PR detail
- **THEN** the response reflects the new head commit and the diff includes the new commits

#### Scenario: Detail read of a merged PR
- **WHEN** a client fetches the detail of a `merged` PR
- **THEN** the stored `headCommit`, `baseCommit`, and `mergeCommit` are returned unchanged without refreshing from live branches

### Requirement: Status filtering on list surfaces
The PR list REST endpoint SHALL accept a `status` query parameter with values `open`, `closed`, `merged`, or `all`, defaulting to `all` for the REST API. The web PR list page SHALL default to showing open PRs and SHALL provide controls to switch to closed and merged PRs. The CLI `pr list` command SHALL accept a `--status` option with the same values.

#### Scenario: Filtering by status over REST
- **WHEN** a client requests `GET /v1/repos/:owner/:repo/pulls?status=merged`
- **THEN** the response contains only PRs whose status is `merged`

#### Scenario: REST list without a status parameter
- **WHEN** a client requests the PR list without a `status` parameter
- **THEN** all PRs are returned regardless of status, preserving pre-existing behavior

#### Scenario: Web list default
- **WHEN** a user opens the web PR list page without a filter
- **THEN** only open PRs are shown, with visible counts or links for closed and merged PRs

### Requirement: Lifecycle surfaces parity
Close and reopen SHALL be available via REST (`POST /v1/repos/:owner/:repo/pulls/:pull/close` and `.../reopen`), via the web PR detail page (action buttons rendered only for authorized users), and via the CLI (`pr close`, `pr reopen`). The web PR detail and list pages SHALL display distinct status badges for `open`, `closed`, and `merged`.

#### Scenario: Close via CLI
- **WHEN** an authorized user runs `octopus pr close <owner/repo> <number>`
- **THEN** the CLI calls the close endpoint and prints the resulting PR status

#### Scenario: Action buttons hidden for read-only viewers
- **WHEN** a user without close/merge authorization views an open PR's detail page
- **THEN** no close, reopen, or merge controls are rendered

### Requirement: Backward-compatible PR store evolution
The server SHALL read existing PR store files written before this change (lacking lifecycle metadata and comments) without error, treating missing `comments` as an empty list and missing lifecycle fields as unset.

#### Scenario: Loading a pre-existing store file
- **WHEN** the server reads a `version: 1` PR store file created before this change
- **THEN** all PRs load successfully with status `open` or `closed` as stored, an empty comment list, and no merge metadata
