## Context

`apps/server` (`@octopus/server`) is the core of Octopus — a Fastify-based Git smart-HTTP gateway, REST API, and server-rendered HTML UI. It has accreted into two monoliths:

- `server.ts` (1,838 lines): a single `buildServer(config)` closure holding ~400 lines of inline web-session/cookie/HMAC/challenge helpers, then ~50 routes registered inline, with business logic embedded in handlers.
- `web.ts` (5,489 lines): every server-rendered HTML page in one module.

Supporting subsystems (`auth`, `git`, `sui`, `walrus`, `seal`, `artifacts`, `restore`, `indexer`, `pull-requests`, `enoki`, `namespace`, `repo-activity`, `commit-actors`, `push-attempts`) are exported as **free functions** that take `config` (and other dependencies) as parameters on every call. There is no Fastify plugin encapsulation, no routes→services→repositories layering, and no lint/format/config-validation tooling (only `tsc --noEmit`).

Constraints that shape the design:
- ESM throughout (`"type": "module"`, `NodeNext`) — relative imports use `.js` extensions.
- `@ducnmm/octopus-shared` is consumed as a built artifact and owns the Zod request schemas, auth header names, and delegate-token message format — the contract between CLI/server/web. This restructure must not change that contract.
- `buildServer(config)` is the integration surface used by `index.ts` and the e2e tests (`git-http.e2e.test.ts`). Its signature should remain stable.
- Public behavior is frozen: REST/Git routes, `x-octopus-auth-token`, web-session cookies, and rendered HTML must be byte-for-byte preserved.
- Already-good infrastructure to keep: pino logger with header redaction, central `setErrorHandler`, custom content-type parsers for `application/x-git-*`, the 200 MB body limit.

## Goals / Non-Goals

**Goals:**
- A layered architecture with clear seams: thin HTTP route handlers → services (business logic) → repositories (storage/Sui/Walrus/Git/Seal access).
- Decompose `server.ts` and `web.ts` into encapsulated Fastify feature plugins and per-page view modules.
- Dependency injection via Fastify decorators: instantiate config-bound services/repositories once at boot; stop threading `config` through every call.
- Declarative request validation at the route edge derived from the existing shared Zod schemas.
- Quality gates: ESLint + Prettier, fail-fast validated env config, scripts wired into the package, root, and CI.
- Tests stay green throughout; the restructure is behavior-preserving.

**Non-Goals:**
- No change to public REST/Git contracts, auth token format, cookie format, or HTML output.
- No new product features, endpoints, or runtime modes.
- No changes to `packages/shared`, `apps/cli`, `apps/web`, or `contracts/sui` (beyond consuming server unchanged).
- No swap of the web framework, logger, validation library, or test runner.
- No database/persistence migration (the `data/` cache layout is unchanged).

## Decisions

### 1. Directory layout: layers + feature modules

Adopt a hybrid where cross-cutting infra and the two horizontal layers (services, repositories) live in dedicated folders, while HTTP concerns are grouped into feature plugins:

```
src/
  index.ts              # bootstrap only: loadConfig → buildServer → listen → graceful shutdown
  app.ts                # buildServer(config): create Fastify, register infra + feature plugins
  config/
    env.ts              # Zod-validated env parsing, fail-fast loadConfig() + ServerConfig type
  plugins/              # cross-cutting, fastify-plugin (fp) wrapped → decorations escape encapsulation
    cors.ts
    error-handler.ts
    content-parsers.ts
    container.ts        # instantiate repositories + services once; fastify.decorate('services', …)
    auth-context.ts     # onRequest hook + decorateRequest('auth' | 'webSession', …)
  routes/               # encapsulated feature plugins (NOT fp) — thin handlers + route schemas
    health.ts
    assets.ts
    auth/               # web-session, challenges, delegate, enoki sponsorship
    repos/
    pull-requests/
    git-http/
    web/                # server-rendered HTML pages (home, login, repo browse)
  services/             # business logic, framework-agnostic, depend on repositories
  repositories/         # data access; wrap existing subsystems behind interfaces
  views/                # shared layout/render helpers + per-page templates (from web.ts)
  lib/                  # pure helpers (cookie codec, hmac, constant-time compare, challenge store)
```

Existing subsystem files are **relocated, not rewritten**: e.g. `git.ts`→`repositories/git-repository.ts`, `walrus.ts`→`repositories/walrus-repository.ts`, `pull-requests.ts` business logic→`services/pull-request-service.ts` over a `pull-request-repository`. The goal is moving code behind seams, preserving the proven implementations.

*Alternative considered:* fully self-contained vertical modules (`modules/<domain>/{routes,service,repository,views}`). Rejected as the primary axis because several repositories (git, walrus, sui, seal) are shared across domains and would not have one obvious owning module; horizontal `services/` + `repositories/` folders keep shared access discoverable. Feature grouping is still applied within `routes/`.

### 2. Plugin encapsulation strategy: `fp` for infra, plain for features

Per Fastify guidance: anything that must expose a decorator/hook to siblings (config, the service container, the auth-context hook, error handler, content parsers) is wrapped with `fastify-plugin` so its decorations escape the local scope. Feature route plugins are **not** wrapped — they stay encapsulated so their routes/hooks are scoped to their subtree. Registration order in `app.ts`: infra plugins (fp) first, then feature route plugins.

*Alternative considered:* `@fastify/autoload` to auto-register `routes/`. Deferred (Open Question) — explicit registration in `app.ts` keeps load order obvious during the migration and avoids a new dependency mid-restructure; autoload can be adopted afterward.

### 3. Dependency injection via a service container decorator

A single `container.ts` plugin instantiates every repository and service once at boot (bound to the validated config) and calls `fastify.decorate('services', container)`. Handlers reach dependencies via `this.services` / `request.server.services` instead of importing free functions and passing `config`. Per-request identity (delegate `AuthContext`, web session) is resolved in an `onRequest` hook and attached with `decorateRequest`, replacing the inline session/cookie parsing currently at the top of `buildServer`.

*Alternative considered:* a third-party DI container (awilix/tsyringe). Rejected — Fastify decorators are the idiomatic, zero-dependency mechanism and the dependency graph here is small and static.

### 4. Route schema validation derived from shared Zod schemas

Attach a Fastify `schema` to each route. Because `@ducnmm/octopus-shared` already defines the request shapes in Zod, use `fastify-type-provider-zod` (`validatorCompiler`/`serializerCompiler`) so route schemas reuse the shared Zod definitions directly — single source of truth, end-to-end types, and validation/serialization moved out of handler bodies.

*Alternatives considered:* (a) hand-written JSON Schema per route — rejected (duplicates the Zod schemas, drifts); (b) keep manual `.parse()` in handlers — rejected (that is the status quo we are removing). If adding the type-provider dependency is undesirable, the fallback is `zod-to-json-schema` at registration time (Open Question).

### 5. Fail-fast validated env config

Rewrite `config.ts` as `config/env.ts`: a Zod schema over the relevant `process.env` keys with coercion (ports, ttls, booleans) and the existing fallback-key precedence, producing the typed `ServerConfig`. On invalid/missing required config it throws a single aggregated, readable error at startup rather than failing deep in a request.

*Alternative considered:* `@fastify/env` (JSON-schema/Ajv based). Rejected for consistency with the Zod-everywhere choice and to keep precedence/fallback logic (which `@fastify/env` does not express well) in plain TS.

### 6. Lint + format toolchain: ESLint (flat) + Prettier

Add ESLint with `typescript-eslint` (flat `eslint.config.js`) and Prettier, configured at the workspace root so all packages can opt in, with `lint`/`format` scripts in `apps/server/package.json` and aggregated root scripts. Wire `lint` into `.github/workflows/ci.yml` before `check`.

*Alternative considered:* Biome (single fast binary for lint+format). A strong option, but ESLint + typescript-eslint has broader rule coverage and ecosystem familiarity, and matches the tooling named when scoping this change. Biome remains a viable future swap (Open Question).

### 7. Behavior-preserving HTML decomposition

`web.ts` is split by moving render functions verbatim into `views/` (shared layout + per-page modules colocated conceptually with their `routes/web/` handlers). No markup, inline CSS, or asset wiring changes — the split is mechanical so the existing visual theme (and the `login-visual-theme` spec) is untouched.

## Risks / Trade-offs

- **HTML/behavior drift while splitting `web.ts` (5.5k lines)** → Move render code verbatim (no edits during relocation); rely on the existing e2e test and add HTML snapshot checks for key pages before/after each move; do the split in small commits per page group.
- **Encapsulation mistakes (a decorator/hook invisible where expected)** → Strictly apply the rule "shared = `fp`, feature = plain"; `decorate` throws at boot on missing dependencies, surfacing wiring errors before serving traffic.
- **Large, hard-to-review diff** → Execute as a strangler migration in phases (see Migration Plan); keep `buildServer(config)` signature stable so each phase is independently testable and shippable.
- **New dependencies (`fastify-type-provider-zod`, ESLint stack)** → Pin versions; the type provider is additive and can be rolled back to manual JSON Schema without changing route semantics.
- **Shared-package build gotcha** → Unchanged by this work, but the migration must keep rebuilding `@ducnmm/octopus-shared` before server `check`/`test` as today.
- **Hidden coupling via module-level mutable state** (e.g. in-memory `webChallenges`/`repoUnlockChallenges` maps) → Move these into an injected, single-instance store in the container so lifetime/ownership is explicit rather than file-global.

## Migration Plan

Full restructure delivered, executed as a behavior-preserving strangler so tests stay green at every step:

1. **Scaffold + tooling**: add `config/env.ts` (validated), `app.ts`/`index.ts` split, ESLint/Prettier, and CI lint step. `app.ts` initially just calls the existing wiring.
2. **Infra plugins**: extract CORS, error handler, content parsers, and the service `container` + `auth-context` hook into `plugins/` (fp). Re-point `buildServer` to register them.
3. **Repositories**: relocate `git`/`walrus`/`sui`/`seal`/`artifacts`/`indexer`/storage subsystems behind `repositories/` interfaces; wire into the container.
4. **Services**: lift handler business logic (repos, pull-requests, restore, auth/web-session) into `services/`.
5. **Routes**: move endpoints into encapsulated feature plugins under `routes/`, attaching Zod-derived schemas; delete the corresponding inline blocks from `server.ts`.
6. **Views**: split `web.ts` into `views/` + `routes/web/`, page group by page group.
7. **Cleanup**: remove the emptied `server.ts`/`web.ts`, run full `check`/`test`/`lint`/`build`.

**Rollback**: every phase is a self-contained, behavior-preserving commit; revert the offending phase. Because public contracts and HTML are preserved, rollback is low-risk and does not require coordinated client changes.

## Open Questions

- Final lint/format pick: ESLint + Prettier (current decision) vs Biome — confirm before phase 1.
- Adopt `fastify-type-provider-zod` now, or start with `zod-to-json-schema` and migrate later?
- Introduce `@fastify/autoload` for `routes/` in this change, or defer to a follow-up once the explicit structure is stable?
- Should HTML snapshot tests be added as a permanent regression guard, or are they scaffolding to delete after the `web.ts` split?
