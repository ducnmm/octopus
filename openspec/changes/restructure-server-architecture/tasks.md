## 1. Tooling & quality gates

- [ ] 1.1 Add ESLint (flat `eslint.config.js`) with `typescript-eslint` at the workspace root, scoped to TypeScript sources
- [ ] 1.2 Add Prettier with a shared config and an `.prettierignore`
- [ ] 1.3 Add `lint`, `lint:fix`, `format`, and `format:check` scripts to `apps/server/package.json`
- [ ] 1.4 Add aggregated `lint`/`format` scripts to the root `package.json`
- [ ] 1.5 Add a lint + format-check step to `.github/workflows/ci.yml` before `check`
- [ ] 1.6 Run lint/format across `apps/server/src`, fixing autofixable issues, to establish a clean baseline

## 2. Validated config & bootstrap split

- [ ] 2.1 Create `src/config/env.ts` with a Zod schema over the env keys, coercion, and the existing fallback-key precedence, exporting `loadConfig()` and `ServerConfig`
- [ ] 2.2 Make `loadConfig()` fail fast with a single aggregated, human-readable error on missing/invalid required config
- [ ] 2.3 Create `src/app.ts` exporting `buildServer(config)` (initially delegating to existing wiring) and reduce `src/index.ts` to bootstrap-only (load config, build, listen, graceful shutdown)
- [ ] 2.4 Wire SIGINT/SIGTERM to `app.close()` for orderly shutdown
- [ ] 2.5 Verify `pnpm --filter @octopus/server check` and existing tests still pass

## 3. Cross-cutting infrastructure plugins (fastify-plugin)

- [ ] 3.1 Extract CORS handling into `src/plugins/cors.ts` (fp)
- [ ] 3.2 Extract the central error handler into `src/plugins/error-handler.ts` (fp), preserving redaction
- [ ] 3.3 Extract `application/x-git-*` and form content-type parsers into `src/plugins/content-parsers.ts` (fp)
- [ ] 3.4 Create `src/plugins/container.ts` (fp) that instantiates repositories + services once and calls `fastify.decorate('services', …)`
- [ ] 3.5 Create `src/plugins/auth-context.ts` (fp): `onRequest` hook resolving delegate + web-session identity, attached via `decorateRequest`
- [ ] 3.6 Move in-memory challenge/session maps into an injected single-instance store owned by the container
- [ ] 3.7 Register infra plugins (fp) first in `app.ts`; confirm decorators resolve at boot

## 4. Repositories layer (data access)

- [ ] 4.1 Define repository interfaces and move Git access (`git.ts`) into `src/repositories/git-repository.ts`
- [ ] 4.2 Move Walrus access (`walrus.ts`) into `src/repositories/walrus-repository.ts`
- [ ] 4.3 Move Sui access (`sui.ts`) into `src/repositories/sui-repository.ts`
- [ ] 4.4 Move Seal access (`seal.ts`) into `src/repositories/seal-repository.ts`
- [ ] 4.5 Move artifact/manifest, index, push-attempts, repo-activity, and commit-actors access into `src/repositories/`
- [ ] 4.6 Register all repositories in the container; ensure no repository imports Fastify request/reply types

## 5. Services layer (business logic)

- [ ] 5.1 Create `src/services/auth-service.ts` (delegate verification, web-session lifecycle, challenges) over repositories/stores
- [ ] 5.2 Create `src/services/repo-service.ts` (create/connect/read, access checks, namespace resolution)
- [ ] 5.3 Create `src/services/pull-request-service.ts` from `pull-requests.ts` logic
- [ ] 5.4 Create `src/services/restore-service.ts` and `src/services/enoki-service.ts`
- [ ] 5.5 Ensure services depend only on repositories/config and contain no Fastify types; register them in the container

## 6. Route plugins (thin HTTP handlers)

- [ ] 6.1 Add `fastify-type-provider-zod` and wire `validatorCompiler`/`serializerCompiler` in `app.ts`
- [ ] 6.2 Create `src/routes/health.ts` and `src/routes/assets.ts` plugins
- [ ] 6.3 Create `src/routes/auth/` plugin (web-session, challenges, delegate, enoki sponsorship) with Zod-derived schemas, delegating to services
- [ ] 6.4 Create `src/routes/repos/` plugin with schemas, delegating to `repo-service`
- [ ] 6.5 Create `src/routes/pull-requests/` plugin with schemas, delegating to `pull-request-service`
- [ ] 6.6 Create `src/routes/git-http/` plugin delegating to the git repository/service
- [ ] 6.7 Remove the corresponding inline route blocks from `server.ts` as each plugin lands

## 7. HTML views decomposition

- [ ] 7.1 Create `src/views/` with a shared layout/render helper extracted from `web.ts`
- [ ] 7.2 Move per-page render functions verbatim into `src/views/` modules, page group by page group
- [ ] 7.3 Create `src/routes/web/` plugin(s) that call the view modules
- [ ] 7.4 Add HTML snapshot checks for key pages (home, login, repo browse) to guard against drift during the split
- [ ] 7.5 Confirm rendered HTML matches pre-restructure output for all migrated pages

## 8. Cleanup & verification

- [ ] 8.1 Delete the emptied `server.ts` and `web.ts`; confirm `buildServer(config)` still resolves from `app.ts`
- [ ] 8.2 Confirm no module reads `process.env` directly outside `config/env.ts`
- [ ] 8.3 Run `pnpm --filter @octopus/server lint`, `check`, `test`, and `build` — all green
- [ ] 8.4 Run the full root `pnpm check && pnpm test && pnpm build` and the existing vitest suites unchanged
- [ ] 8.5 Update `CLAUDE.md` server module map and `docs/reference/env-vars.md` if config keys/structure descriptions changed
