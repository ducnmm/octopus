# server-module-architecture Specification (Delta)

## MODIFIED Requirements

### Requirement: Feature-based Fastify plugin decomposition

The server SHALL be composed of encapsulated Fastify plugins grouped by feature domain (at minimum: health, assets, auth/web-session, repos, pull-requests, git-http, enoki, and SPA static serving), registered from a single `app.ts` that exposes a stable `buildServer(config)` entry point. No single source file SHALL register all routes, and the previous monolithic `server.ts` and `web.ts` SHALL no longer exist as catch-all modules. The server MUST NOT render HTML pages: it SHALL NOT import view templates from `@octopus/web/views/*` or any other source, and web pages SHALL be delivered by serving the built SPA bundle. Types shared between server and web (such as the viewer identity and repo list item shapes) SHALL be imported from `@ducnmm/octopus-shared`.

#### Scenario: Routes are registered via feature plugins

- **WHEN** `buildServer(config)` constructs the application
- **THEN** routes are added by registering per-domain plugins from `src/routes/`, and no file registers more than its own domain's routes

#### Scenario: Stable build entry point is preserved

- **WHEN** `index.ts` or an existing test calls `buildServer(config)`
- **THEN** it returns a ready Fastify instance with the same public routes and behavior as before the restructure

#### Scenario: No HTML view imports in the server

- **WHEN** the server is compiled or run
- **THEN** no server module imports from `@octopus/web/views/*`, no route handler sends `text/html` page markup it generated from templates, and shared view-model types resolve from `@ducnmm/octopus-shared`
