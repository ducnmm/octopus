## ADDED Requirements

### Requirement: Linting

The server package SHALL have static linting via ESLint with `typescript-eslint`, configured for the workspace and exposed through a `lint` script in `apps/server/package.json` and an aggregated root script. Linting SHALL cover all TypeScript source under `apps/server/src`.

#### Scenario: Lint script runs

- **WHEN** `pnpm --filter @octopus/server lint` is executed
- **THEN** ESLint runs against `apps/server/src` and exits non-zero if any error-level rule is violated

#### Scenario: Lint participates in the workspace

- **WHEN** the root lint script is executed
- **THEN** it includes the server package so a server lint failure fails the aggregate run

### Requirement: Formatting

The repository SHALL provide automated code formatting (Prettier) with a shared configuration, and the server package SHALL expose `format` (write) and a check mode so formatting can be verified without modifying files.

#### Scenario: Format check detects drift

- **WHEN** the format check is run on correctly formatted code
- **THEN** it exits zero; and **WHEN** run on misformatted code, it exits non-zero

### Requirement: Fail-fast validated environment configuration

The server SHALL validate its environment configuration at startup against an explicit schema, applying coercion (numeric ports/TTLs, booleans) and the established fallback-key precedence. On missing or invalid required configuration, startup SHALL fail with a single aggregated, human-readable error identifying the offending keys, rather than failing later inside a request.

#### Scenario: Invalid config fails at startup

- **WHEN** the server starts with a required configuration value missing or malformed
- **THEN** startup aborts immediately with an error naming the offending key(s) and the validation reason

#### Scenario: Valid config produces a typed object

- **WHEN** the server starts with valid configuration
- **THEN** `loadConfig()` returns a fully typed `ServerConfig` with coerced values, and downstream code consumes the typed object rather than reading `process.env` directly

### Requirement: Quality gates wired into CI

The continuous integration workflow SHALL run linting (and formatting verification) for the server as a gate alongside the existing `check`, `test`, and `build` steps, so style and static-analysis regressions fail the pipeline.

#### Scenario: CI fails on lint error

- **WHEN** a change introduces an error-level lint violation in `apps/server/src`
- **THEN** the CI workflow fails at the lint step before merge
