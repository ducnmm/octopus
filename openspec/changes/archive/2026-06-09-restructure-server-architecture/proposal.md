## Why

`apps/server` has grown into two monoliths: `server.ts` (1,838 lines) wires every route inside a single `buildServer()` closure — with ~400 lines of inline session/cookie/HMAC/challenge auth helpers — and `web.ts` (5,489 lines) renders every HTML page in one file. Subsystems are flat function modules that re-thread `config` through every call, route handlers embed business logic directly, and there is no Fastify plugin encapsulation, no routes→services→repositories layering, and no lint/format/config-validation tooling. This makes the core service hard to navigate, test in isolation, and extend safely. A full restructure now — before more features land — establishes a maintainable foundation.

## What Changes

- **Layered architecture**: introduce explicit `routes → services → repositories` layers. HTTP handlers become thin (parse, authorize, delegate, respond); business logic moves into services; storage/Sui/Walrus/Git access moves behind repository interfaces. Existing flat subsystems (`sui.ts`, `walrus.ts`, `seal.ts`, `artifacts.ts`, etc.) are wrapped/relocated into these layers.
- **Fastify plugin modularization**: decompose the single `buildServer()` closure into encapsulated Fastify plugins registered by feature domain (`health`, `assets`, `auth`/`web-session`, `repos`, `pull-requests`, `git-http`, `enoki`, `web-ui`). Cross-cutting concerns (CORS, error handling, content-type parsers, auth context) become shared plugins/hooks.
- **Dependency injection via decorators**: instantiate config-bound services/repositories once at startup and expose them through Fastify `decorate`/`decorateRequest` instead of importing free functions and passing `config` everywhere.
- **Decompose `web.ts`**: split the 5,489-line HTML renderer into per-page/per-component view modules with a shared layout/render utility, colocated with their owning route plugins.
- **Route schema validation**: attach Fastify JSON Schema (derived from the shared Zod request schemas) to route definitions so validation/serialization is declarative at the edge instead of manual `.parse()` calls inside handlers.
- **Tooling & quality gates**: add ESLint (typescript-eslint) + Prettier (or Biome) with workspace config and scripts; add fail-fast, validated env-config parsing in `config.ts`; wire `lint`/`format` into the server package and root scripts and into CI.
- Behavior-preserving: no public REST/Git endpoint contracts, auth token formats, or HTML output change. This is a **structural** restructure.

## Capabilities

### New Capabilities
- `server-module-architecture`: Defines the layered, plugin-encapsulated structure of `apps/server` — the routes→services→repositories layering, Fastify plugin decomposition by feature domain, decorator-based dependency injection, decomposition of the monolithic `server.ts`/`web.ts`, and declarative route schema validation.
- `server-quality-tooling`: Defines the developer-facing quality gates for `apps/server` — linting, formatting, fail-fast validated environment configuration, and their integration into package/root scripts and CI.

### Modified Capabilities
<!-- None. No existing spec-level requirements change; this is a structural/tooling restructure. The only existing spec (login-visual-theme) is unaffected because HTML output is preserved. -->

## Impact

- **Code**: `apps/server/src/**` — heavy reorganization. `server.ts` and `web.ts` are split into plugin/route/view/service/repository modules; `index.ts` bootstrap and `config.ts` are updated. Subsystem modules (`auth.ts`, `git.ts`, `sui.ts`, `walrus.ts`, `seal.ts`, `artifacts.ts`, `restore.ts`, `indexer.ts`, `pull-requests.ts`, `enoki.ts`, `namespace.ts`, `repo-activity.ts`, `commit-actors.ts`, `push-attempts.ts`) are relocated/wrapped into the new layering.
- **Public contracts**: unchanged — REST/Git routes, `x-octopus-auth-token` format, web-session cookies, and rendered HTML are preserved.
- **Tooling/deps**: new dev dependencies (ESLint + typescript-eslint + Prettier, or Biome). New `lint`/`format` scripts in `apps/server/package.json` and root `package.json`; CI (`.github/workflows/ci.yml`) gains a lint step.
- **Tests**: existing vitest suites (`git-http.e2e`, `seal`, `walrus`, `walrus-relay`) must continue to pass; new layering enables finer-grained unit tests for services/repositories.
- **Deployment**: `Dockerfile`/Railway build still target shared + server; no runtime image surface change beyond the reorganized source.
