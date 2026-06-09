## ADDED Requirements

### Requirement: Layered separation of HTTP, business, and data-access concerns

The server SHALL organize code into three distinct layers — routes (HTTP), services (business logic), and repositories (data access) — with dependencies pointing inward only. Route handlers SHALL be thin: parse/validate input, authorize, delegate to a service, and shape the response. Business logic SHALL live in services. All access to storage, Git, Sui, Walrus, and Seal SHALL go through repositories. Services and repositories MUST NOT import Fastify request/reply types.

#### Scenario: Route handler delegates instead of embedding logic

- **WHEN** a REST or Git route handler in `src/routes/` executes
- **THEN** it resolves dependencies from the injected service container, calls a service method for any business logic, and contains no direct calls to storage/Git/Sui/Walrus/Seal clients

#### Scenario: Services and repositories are framework-agnostic

- **WHEN** a module under `src/services/` or `src/repositories/` is inspected
- **THEN** it imports no Fastify `FastifyRequest`/`FastifyReply` types and can be unit-tested without an HTTP server

### Requirement: Feature-based Fastify plugin decomposition

The server SHALL be composed of encapsulated Fastify plugins grouped by feature domain (at minimum: health, assets, auth/web-session, repos, pull-requests, git-http, enoki, and web UI), registered from a single `app.ts` that exposes a stable `buildServer(config)` entry point. No single source file SHALL register all routes, and the previous monolithic `server.ts` and `web.ts` SHALL no longer exist as catch-all modules.

#### Scenario: Routes are registered via feature plugins

- **WHEN** `buildServer(config)` constructs the application
- **THEN** routes are added by registering per-domain plugins from `src/routes/`, and no file registers more than its own domain's routes

#### Scenario: Stable build entry point is preserved

- **WHEN** `index.ts` or an existing test calls `buildServer(config)`
- **THEN** it returns a ready Fastify instance with the same public routes and behavior as before the restructure

### Requirement: Dependency injection via Fastify decorators

The server SHALL instantiate config-bound services and repositories once during boot and expose them through Fastify decorators rather than re-importing free functions and threading `config` through every call. Cross-cutting infrastructure that must share decorators or hooks across sibling plugins SHALL be registered with `fastify-plugin`; feature route plugins SHALL remain encapsulated (not wrapped with `fastify-plugin`).

#### Scenario: Services resolved from the instance

- **WHEN** a route handler needs a service or repository
- **THEN** it accesses it via the decorated container (e.g. `request.server.services`) instead of constructing it or importing a free function that takes `config`

#### Scenario: Missing dependency fails at boot

- **WHEN** a plugin declares a decorator dependency that has not been registered
- **THEN** the server fails to boot with a clear error instead of failing during a request

### Requirement: Per-request identity attached via hooks

The server SHALL resolve delegate authentication and web-session identity in a shared request lifecycle hook and attach the result to the request via `decorateRequest`, replacing inline session/cookie/challenge parsing inside route handlers. In-memory challenge/session state SHALL be owned by an injected single-instance store rather than file-global mutable maps.

#### Scenario: Auth context available to handlers

- **WHEN** an authenticated REST or Git request is processed
- **THEN** the resolved auth/session context is read from the request decoration set by the shared hook, and handlers do not re-parse cookies or auth tokens inline

### Requirement: Declarative route schema validation from shared Zod schemas

Routes that accept request bodies, params, or querystrings SHALL declare a Fastify `schema` derived from the existing `@ducnmm/octopus-shared` Zod request schemas, so validation occurs at the route edge rather than via manual `.parse()` calls inside handlers. The shared Zod definitions SHALL remain the single source of truth for request shapes.

#### Scenario: Invalid request rejected at the edge

- **WHEN** a request body fails the route's declared schema
- **THEN** the framework rejects it with a validation error before the handler body runs

#### Scenario: No duplicated request shape definitions

- **WHEN** a route's input schema is defined
- **THEN** it reuses the corresponding shared Zod schema rather than re-declaring the field shapes inline

### Requirement: Behavior-preserving public contracts

The restructure SHALL preserve all public contracts: REST and Git smart-HTTP endpoints, the `x-octopus-auth-token` message format, web-session cookie format, and server-rendered HTML output. Cross-cutting infrastructure already present — pino logging with header redaction, the central error handler, custom `application/x-git-*` content-type parsers, and the configured body limit — SHALL be retained.

#### Scenario: Existing test suites pass unchanged

- **WHEN** the existing vitest suites (`git-http.e2e`, `seal`, `walrus`, `walrus-relay`) run against the restructured server
- **THEN** they pass without modification to their assertions

#### Scenario: Rendered HTML is unchanged

- **WHEN** a server-rendered page (e.g. home, login, repo browse) is requested after the `web.ts` decomposition
- **THEN** the produced HTML matches the pre-restructure output

### Requirement: Application bootstrap and lifecycle separation

The server SHALL separate process bootstrap (`index.ts`: load config, build the app, listen, handle graceful shutdown) from application composition (`app.ts`: create the Fastify instance and register plugins). Shutdown signals SHALL trigger an orderly close of the Fastify instance.

#### Scenario: Bootstrap is isolated from composition

- **WHEN** `index.ts` is inspected
- **THEN** it only loads config, builds the app via `buildServer`, starts listening, and wires shutdown — it registers no routes directly
