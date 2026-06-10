# cli-repo-discovery

## ADDED Requirements

### Requirement: List visible repositories from the CLI

The CLI SHALL provide a `repo list` command that retrieves repositories from
`GET /v1/repos` and prints each repository's owner, name, and visibility, one
repository per line. The command SHALL include delegate auth headers when the
user is logged in and SHALL still work anonymously, in which case only public
repositories are listed. The command SHALL support an `--owner <owner>` option
that filters the output to a single owner namespace.

#### Scenario: Logged-in user lists repositories

- **WHEN** a logged-in user runs `octopus repo list`
- **THEN** the CLI calls `GET /v1/repos` with delegate auth headers and prints
  every returned repository as `owner/name (visibility)`

#### Scenario: Filter by owner

- **WHEN** a user runs `octopus repo list --owner alice`
- **THEN** only repositories whose owner is `alice` are printed

#### Scenario: No repositories visible

- **WHEN** the server returns an empty repository list
- **THEN** the CLI prints a message stating no repositories were found and
  exits with status 0

### Requirement: One-step authenticated clone

The CLI SHALL provide a `repo clone <owner/name> [directory]` command that
resolves the repository's git remote URL from the selected server, runs
`git clone` against it, and — when the user is logged in — supplies the
delegate git auth header during the clone and applies the same remote and
header configuration as `repo connect` inside the resulting working copy.
When the user is not logged in, the command SHALL attempt an anonymous clone
without auth configuration.

#### Scenario: Logged-in user clones a private repository

- **WHEN** a logged-in user with access runs `octopus repo clone alice/secrets`
- **THEN** the clone succeeds using a git-scoped delegate auth header passed
  via git's `http.<url>.extraHeader` configuration
- **THEN** the cloned working copy's remote carries the same persisted auth
  header configuration that `repo connect` would have produced

#### Scenario: Anonymous user clones a public repository

- **WHEN** a logged-out user runs `octopus repo clone alice/website`
- **THEN** the CLI performs a plain `git clone` without auth headers and the
  clone succeeds

#### Scenario: Anonymous user attempts to clone a private repository

- **WHEN** a logged-out user runs `octopus repo clone alice/secrets`
- **THEN** the command fails and the error message suggests running
  `octopus auth login`

#### Scenario: Clone into an explicit directory

- **WHEN** a user runs `octopus repo clone alice/website my-site`
- **THEN** the repository is cloned into `my-site` and the post-clone remote
  configuration is applied in that directory
