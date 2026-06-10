# pull-request-comments

## ADDED Requirements

### Requirement: PR conversation comments
A pull request SHALL have a flat, chronologically ordered list of comments. Each comment SHALL record a unique id, the author's account id and wallet address, a body of 1 to 10,000 characters, and a creation timestamp. Creating a comment SHALL update the PR's `updatedAtMs`. Comments SHALL be permitted on PRs in any status.

#### Scenario: Commenting on an open PR
- **WHEN** the PR author or a repository writer posts a comment body within the length limit
- **THEN** the comment is persisted with author attribution and timestamp and appears in subsequent reads in chronological order

#### Scenario: Empty or oversized comment rejected
- **WHEN** a client posts a comment with an empty body or a body longer than 10,000 characters
- **THEN** the server rejects the request with HTTP 400 and no comment is stored

#### Scenario: Commenting on a merged PR
- **WHEN** an authorized actor posts a comment on a PR whose status is `merged`
- **THEN** the comment is accepted and stored

### Requirement: Comment authorization
Posting a comment SHALL require authentication and SHALL be permitted to the PR author or any account with repository write access. Reading comments SHALL follow the repository's content read access rules (public repos readable by anyone; private repos require read access).

#### Scenario: Unauthorized commenter rejected
- **WHEN** an authenticated account that is neither the PR author nor a repository writer posts a comment
- **THEN** the server rejects the request with HTTP 403

#### Scenario: Comments on a private repository
- **WHEN** an unauthenticated client requests the comments of a PR in a private repository
- **THEN** the server rejects the request with HTTP 401 or 404, consistent with existing private-repo content access behavior

### Requirement: Comment surfaces
Comments SHALL be exposed via REST (`GET /v1/repos/:owner/:repo/pulls/:pull/comments` returning the ordered list, and `POST .../comments` returning the created comment with HTTP 201), rendered on the web PR detail page as a conversation thread with a comment form for authorized users, and supported in the CLI via `pr comment <owner/repo> <number> --body <text>`. The CLI `pr view` command SHALL include the comment count.

#### Scenario: Conversation rendered on the web detail page
- **WHEN** a user views a PR detail page for a PR with comments
- **THEN** the comments are rendered in order with author and timestamp, and an authorized user sees a form to add a comment

#### Scenario: Comment via CLI
- **WHEN** an authorized user runs `octopus pr comment owner/repo 4 --body "looks good"`
- **THEN** the CLI posts the comment and prints confirmation including the comment timestamp
