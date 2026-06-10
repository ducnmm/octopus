## MODIFIED Requirements

### Requirement: Feature-based Fastify plugin decomposition

The server SHALL be composed of encapsulated Fastify plugins grouped by feature domain (at minimum: health, assets, auth/web-session, repos, pull-requests, git-http, enoki, and web UI), registered from a single `app.ts` that exposes a stable `buildServer(config)` entry point. No single source file SHALL register all routes, and the previous monolithic `server.ts` and `web.ts` SHALL no longer exist as catch-all modules. The HTML view templates used by the web UI features SHALL be imported from the frontend workspace package (`@octopus/web`).

#### Scenario: Routes are registered via feature plugins

- **WHEN** `buildServer(config)` constructs the application
- **THEN** routes are added by registering per-domain plugins from `src/routes/`, and no file registers more than its own domain's routes

#### Scenario: Stable build entry point is preserved

- **WHEN** `index.ts` or an existing test calls `buildServer(config)`
- **THEN** it returns a ready Fastify instance with the same public routes and behavior as before the restructure

#### Scenario: HTML views imported from frontend package

- **WHEN** the server is compiled or run
- **THEN** the server-rendered HTML pages are generated using templates imported from `@octopus/web/views` rather than local server view files
