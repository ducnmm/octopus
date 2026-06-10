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

- [ ] 2.1 Add `react-router` to `apps/web` and restructure `App.tsx`: router with the full URL scheme (`/`, `/new`, `/login`, `/:owner`, `/:owner/:repo`, `/:owner/:repo/commits`, `/:owner/:repo/blob/...`, `/:owner/:repo/activity`, `/:owner/:repo/settings/access`, `/:owner/:repo/pulls`, `/:owner/:repo/pulls/new`, `/:owner/:repo/pulls/:number`); keep the existing auth panels mounted at `/login` with mode query params
- [ ] 2.2 Create `src/lib/api.ts` typed fetch client (same-origin credentials, JSON parsing, structured error type carrying status + error code)
- [ ] 2.3 Create `useViewer` hook backed by `GET /v1/viewer` and a viewer context provider
- [ ] 2.4 Install the shadcn/ui primitives the pages need via `pnpm dlx shadcn@latest add` (card, input, label, textarea, select, dropdown-menu, tabs, badge, avatar, table, dialog, separator, skeleton, breadcrumb, alert, tooltip, sonner) — `components.json` already configures style/aliases
- [ ] 2.5 Build layout components on those primitives: `AppShell`, `TopNav` (viewer state, login/logout links), `PageContainer`, `Footer`, plus shared `Loading` (Skeleton-based) and `ErrorPanel` (Alert-based) components
- [ ] 2.6 Add private-repo guard: on `401`/`403` from the API, route to the login/unlock flow (reusing `WebLoginPanel`/`UnlockRepoPanel`) and return to the requested page after success

## 3. Page conversion (use views/pages.ts as the functional parity reference; build every page from shadcn/ui primitives)

- [ ] 3.1 Landing page (`/`) and create-repo page (`/new`)
- [ ] 3.2 Dashboard, repo list, and owner profile pages (`/`, signed-in variant, `/:owner`) with shared repo-card/list components
- [ ] 3.3 Repo home page (`/:owner/:repo`): `RepoHeader`, `RefSelector`, `FileTree`, README/`CloneBox` components fed by `/v1` repo, tree, and blob endpoints
- [ ] 3.4 Commits page (`/:owner/:repo/commits`): `CommitList`/`CommitRow` with actor badges
- [ ] 3.5 Blob page (`/:owner/:repo/blob/...`) with path breadcrumbs
- [ ] 3.6 Activity page and access settings page (`/:owner/:repo/activity`, `/:owner/:repo/settings/access`)
- [ ] 3.7 Pull request pages: list, create, and detail (`/pulls`, `/pulls/new`, `/pulls/:number`) including comment thread and merge/close/reopen actions against the existing `/v1` PR endpoints
- [ ] 3.8 Port behavior from `scripts.ts` (copy-to-clipboard, form submits, tab switching) into React event handlers on shadcn primitives (`Tabs`, `Button`, form components); replace `styles.ts` with Tailwind utilities + shadcn theme variables, keeping only genuinely bespoke rules (diff/file-tree) in `styles.css`
- [ ] 3.9 Add web component tests for key pages (landing, repo home, PR detail) and the private-repo guard; verify each converted page side-by-side against the old server-rendered output

## 4. Server cutover to SPA serving

- [ ] 4.1 Add an SPA static-serving plugin: serve `apps/web/dist` assets and `index.html` fallback for `GET` + `Accept: text/html` requests, registered after Git smart-HTTP, `/v1/*`, and `/healthz` so none are shadowed
- [ ] 4.2 Remove all HTML rendering from `repo-routes.ts`, `pull-request-routes.ts`, and `route-context.ts` (delete `render*Page` imports and `text/html` page responses; private-repo interstitials become the JSON error codes from 1.6)
- [ ] 4.3 Add server tests asserting page URLs return the SPA shell while Git smart-HTTP and `/v1` routes are unaffected

## 5. Delete legacy views and finalize

- [ ] 5.1 Delete `apps/web/src/views/` (pages.ts, scripts.ts, styles.ts, types.ts), remove the `./views/*` subpath exports from `apps/web/package.json`, and drop any now-unneeded `@octopus/web` dependency wiring in the server
- [ ] 5.2 Delete `apps/server/test/views.test.ts` and its snapshots
- [ ] 5.3 Update `Dockerfile` to build and include the web SPA assets, and add `apps/web/**` to `railway.json` watchPatterns
- [ ] 5.4 Update `openspec/specs/server-module-architecture/spec.md` references in docs/CLAUDE.md that describe server-rendered HTML (server module map mentions `web.ts` pages)
- [ ] 5.5 Run `pnpm check && pnpm test && pnpm build`, then manually verify the full flow with `pnpm dev:server` + built SPA: browse public repo, private repo login/unlock, create repo, PR lifecycle
