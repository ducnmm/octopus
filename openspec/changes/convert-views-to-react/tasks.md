# Tasks: Convert Server-Rendered Views to a React SPA

## 1. Shared types and server JSON groundwork (additive, server still renders HTML)

- [x] 1.1 Move `WebViewer`, `RepoListItem`, `RepoRefListItem`, and `toRepoListItem` from `apps/web/src/views/pages.ts` into `packages/shared/src`, export them, and rebuild shared (`pnpm --filter @ducnmm/octopus-shared build`)
- [x] 1.2 Switch `apps/server/src/plugins/auth-context.ts` and `apps/server/src/services/repo-service.ts` to import these from `@ducnmm/octopus-shared` (keep `views/pages.ts` re-exporting them temporarily so HTML routes still compile)
- [x] 1.3 Viewer session JSON: reused the existing `GET /v1/auth/web-session` (returns `{authenticated, accountId, walletAddress, unlockedRepoIds, expiresAtMs}`) instead of adding a duplicate `/v1/viewer`; spec + design updated
- [x] 1.4 Add `GET /v1/repos/:owner/:repo` returning single-repo metadata (counts when content unlocked, registry metadata otherwise, plus `contentUnlocked`)
- [x] 1.5 Audited every page renderer's inputs against `/v1` endpoints — only gap was commit actor attribution; added `GET /v1/repos/:owner/:repo/commit-actors` (PR list/detail/comments, commits, tree, blob, activity, access data all existed)
- [x] 1.6 `/v1` errors now carry structured JSON codes: `login_required` (401, no session), `repo_locked` (423, session but locked), `forbidden` (403) via `httpError(message, status, code)` + error-handler support
- [x] 1.7 Added `test/page-data-api.test.ts` (viewer session, single-repo metadata, commit actors, private-repo error codes); `pnpm check` + `pnpm test` green

## 2. SPA foundation in apps/web

- [x] 2.1 Added `react-router@7` and restructured `App.tsx` into a `BrowserRouter` with the full URL scheme (tree/blob use the legacy query-param form `?ref&path` to keep old links working); auth panels stay at `/login` via `pages/AuthPage.tsx`
- [x] 2.2 Created `src/lib/octopus-api.ts` typed fetch client (`lib/api.ts` was taken by the auth panels) — `ApiError{status,code}`, same-origin/dev-origin resolution, typed methods for every endpoint
- [x] 2.3 Created `useViewer` context provider backed by `GET /v1/auth/web-session` (viewer, accountId, unlockedRepoIds, logout)
- [x] 2.4 Installed shadcn primitives (card, input, label, textarea, select, dropdown-menu, tabs, badge, avatar, table, dialog, separator, skeleton, breadcrumb, alert, tooltip, sonner); removed a stray npm `package-lock.json` that made the shadcn CLI use npm; fixed Tailwind-v4-only syntax (`--spacing()`, `gap-(--var)`) emitted by the radix-nova registry for this repo's Tailwind v3
- [x] 2.5 Built layout components: `AppShell`/`TopNav`/`PageContainer`/`Footer`, `Loading` (Skeleton), `ErrorPanel` (Alert)
- [x] 2.6 Private-repo guard: `lib/auth-redirect.ts` + `DataBoundary` translate `login_required`/`repo_locked` API errors into the login/unlock flow with returnTo back to the requested page

## 3. Page conversion (use views/pages.ts as the functional parity reference; build every page from shadcn/ui primitives)

- [x] 3.1 Landing page (`/`, signed-out hero with aurora/mascot assets) and create-repo page (`/new`, owner namespace + visibility form via `api.createRepo`)
- [x] 3.2 Dashboard (stats + recent-activity feed), owner profile (`/:owner`) with popular-repo grid, contribution calendar + activity (`lib/contributions.ts`); shared `RepoCard`/`RepoMetaList` (legacy `renderRepoListPage` was dead code — no route served it; skipped)
- [x] 3.3 Repo home (`/:owner/:repo` and `/tree`): `RepoHeader`+`RepoNav`, `RefSelector`, `FileBrowser`, `CloneBox`, `ReadmePanel` (ported safe markdown renderer), `SetupGuide` for empty repos
- [x] 3.4 Commits page with actor badges (`commit-actors` endpoint), ref selector, merge badges
- [x] 3.5 Blob page (`/blob?ref&path` — kept the legacy query-param URL form) with breadcrumbs and file-info dropdown
- [x] 3.6 Activity page (proof pills) and access settings page (local repos: JSON contributor API; testnet repos: wallet flow via `/login?mode=access`)
- [x] 3.7 PR list (status filter counts), create (base/head selects), detail (merge strategy/delete-branch, close/reopen, comment thread) — all against `/v1` PR endpoints
- [x] 3.8 `scripts.ts` behaviors became React handlers (`CopyButton`, controlled forms, dropdowns); styling is Tailwind + shadcn theme with only a `readme-body` block added to `styles.css`
- [x] 3.9 Added jsdom + testing-library page tests (landing, dashboard, repo home, PR detail, private-repo guard redirect) — `src/pages/pages.test.tsx`

## 4. Server cutover to SPA serving

- [x] 4.1 Added `routes/spa.ts`: serves `@octopus/web` dist (override via `OCTOPUS_WEB_DIST_DIR`) with immutable caching for hashed assets and an `index.html` not-found fallback; `git-http.ts`'s catch-all now delegates non-`.git` URLs via `reply.callNotFound()`
- [x] 4.2 Removed all HTML rendering: HTML routes deleted from `repo-routes.ts` / `pull-request-routes.ts` (web-form PR actions superseded by `/v1`), HTML interstitials deleted from `route-context.ts`, and the `GET /login` 302 redirect removed (the SPA serves `/login`; panels fetch `/v1/auth/config`)
- [x] 4.3 Added `test/spa-serving.test.ts` (shell for all page URLs, hashed assets, no shadowing of `/v1`/healthz/git, traversal guard) and updated both e2e suites to assert SPA shell + JSON-driven lifecycle

## 5. Delete legacy views and finalize

- [ ] 5.1 Delete `apps/web/src/views/` (pages.ts, scripts.ts, styles.ts, types.ts), remove the `./views/*` subpath exports from `apps/web/package.json`, and drop any now-unneeded `@octopus/web` dependency wiring in the server
- [ ] 5.2 Delete `apps/server/test/views.test.ts` and its snapshots
- [ ] 5.3 Update `Dockerfile` to build and include the web SPA assets, and add `apps/web/**` to `railway.json` watchPatterns
- [ ] 5.4 Update `openspec/specs/server-module-architecture/spec.md` references in docs/CLAUDE.md that describe server-rendered HTML (server module map mentions `web.ts` pages)
- [ ] 5.5 Run `pnpm check && pnpm test && pnpm build`, then manually verify the full flow with `pnpm dev:server` + built SPA: browse public repo, private repo login/unlock, create repo, PR lifecycle
