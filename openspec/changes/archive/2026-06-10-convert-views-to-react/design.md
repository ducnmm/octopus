# Design: Convert Server-Rendered Views to a React SPA

## Context

Every Octopus web page is currently a string-template function in `apps/web/src/views/pages.ts` (~2,500 lines, 16 `render*Page` exports) plus hand-written inline JS (`scripts.ts`, 460 lines) and a CSS string (`styles.ts`, 2,889 lines). The Fastify server imports these via `@octopus/web/views/pages.js` subpath exports and sends `text/html` responses from `repo-routes.ts`, `pull-request-routes.ts`, and `route-context.ts`. Meanwhile `apps/web` already hosts a React 19 + Vite + Tailwind/shadcn app, but only for the wallet login/unlock/access panels selected by query params in `App.tsx`.

The server already exposes most page data as JSON under `/v1/*`: repo list/create, repo index, commits, tree, blob, activity, manifests, restore, PR list/create/detail/merge/close/reopen/comments. The server-as-cache architecture (ADR 0001) is unaffected — this changes presentation only.

## Goals / Non-Goals

**Goals:**
- All pages render client-side in React; the server emits zero HTML markup.
- Pages are decomposed into reusable components instead of monolithic template strings.
- Existing URLs (`/`, `/new`, `/:owner`, `/:owner/:repo`, `/:owner/:repo/commits`, `/:owner/:repo/blob/...`, `/:owner/:repo/pulls[/new|/:n]`, `/:owner/:repo/activity`, `/:owner/:repo/settings/access`) keep working.
- Session-cookie auth keeps working — the SPA can know who the viewer is.
- Visual/functional parity with the current pages; the existing login/unlock panels are reused.

**Non-Goals:**
- No SSR/streaming/hydration framework (no Next.js). The user explicitly wants no server rendering.
- No redesign of page structure or flows — functional parity first. Visual styling converges on the shadcn/ui theme rather than pixel-matching the old CSS; a deliberate restyle beyond that is a separate change.
- No changes to Git smart-HTTP, artifacts, restore, Sui/Walrus subsystems.
- No new state-management library beyond React hooks (introduce TanStack Query only if fetch logic proves unwieldy — default is plain hooks).

## Decisions

### 1. SPA served by the existing Fastify server (single deployment)

The server gains a static-asset plugin that serves the Vite build output (`apps/web/dist`) and returns `index.html` for any non-API, non-Git GET that accepts HTML (history-API fallback). Alternative — deploying the SPA separately (CDN/Netlify) — was rejected: it would split deployment, require CORS for `/v1`, and break the single-origin session cookie. The Docker image already must build `apps/web` (server consumes its `dist` since `move-views-to-web`), so including SPA assets adds no new build stage, only a `railway.json` watchPatterns update.

Route precedence: Git smart-HTTP (`/:owner/:repo/info/refs`, git content-type POSTs), `/v1/*`, `/healthz`, and asset paths are matched first; the HTML fallback is registered last and only for `GET` with `Accept: text/html`.

### 2. Client routing with `react-router` (declarative mode)

`App.tsx` becomes a router: the existing auth panels stay mounted at `/login` (mode query param preserved), and new page routes mirror today's server URL scheme exactly so no links or bookmarks break. Alternative — hand-rolled `location.pathname` switch like the current `authPanelMode` — rejected: 14+ routes with params (`/:owner/:repo/blob/:ref/*`) need real path matching, nested layouts, and link components.

### 3. Data fetching: thin typed API client + per-page hooks

A single `src/lib/api.ts` wraps `fetch` with `credentials: "same-origin"`, JSON parsing, and typed responses; each page gets a hook (`useRepo`, `useCommits`, `usePulls`, …) hitting the existing `/v1` endpoints. Loading and error states are explicit components (skeleton + error panel). Gaps to fill server-side, as JSON only:

- Viewer identity: the existing `GET /v1/auth/web-session` already returns `{authenticated, accountId, walletAddress, unlockedRepoIds, expiresAtMs}` — the SPA reuses it (no new `/v1/viewer` endpoint; discovered during implementation).
- Repo page metadata (`RepoListItem` shape) for a single repo — `GET /v1/repos/:owner/:repo` (counts included only when content is unlocked).
- Commit actor attribution — `GET /v1/repos/:owner/:repo/commit-actors`, used by the repo, commits, and PR detail pages.
- Private-repo handling: `/v1` endpoints return `401`/`403` with a structured error code; the SPA redirects to the in-app login/unlock route (reusing `WebLoginPanel`/`UnlockRepoPanel`) instead of the server rendering `renderPrivateRepoLoginPage`/`renderPrivateRepoUnlockPage`.

### 4. Shared types move to `@ducnmm/octopus-shared`

`WebViewer`, `RepoListItem`, `RepoRefListItem`, and `toRepoListItem(SuiRepoState)` are needed by both server (auth-context plugin, repo-service, the new `/v1/viewer` + repo endpoints) and the SPA. They move from `views/pages.ts` to `packages/shared`. Alternative — keeping them exported from `@octopus/web` — rejected: the whole point is to remove the server→web views dependency; shared is the designated contract package. (Remember the shared build gotcha: rebuild shared before checking downstream.)

### 5. Component architecture in `apps/web/src`: shadcn/ui as the primitive layer

All UI primitives come from shadcn/ui, which is already initialized in `apps/web` (`components.json`, radix-nova style, lucide icons, Tailwind CSS variables — see the `shadcn-setup` spec; only `button` is installed so far). Primitives needed by the pages (card, input, label, textarea, select, dropdown-menu, tabs, badge, avatar, table, dialog, separator, skeleton, breadcrumb, alert, tooltip, sonner/toast) are added via `pnpm dlx shadcn@latest add <component>` into `src/components/ui/` and composed into domain components — no hand-rolled equivalents of primitives shadcn provides. Alternative — porting the bespoke CSS from `styles.ts` onto custom components — rejected: it preserves 2,900 lines of one-off CSS instead of converging on the themed primitive set the repo already adopted.

```
src/
  pages/            # one component per route (RepoPage, CommitsPage, PullRequestPage, ...)
  components/
    layout/         # AppShell, TopNav, Footer, PageContainer
    repo/           # RepoHeader, RefSelector, FileTree, ReadmeCard, CloneBox
    commits/        # CommitList, CommitRow, ActorBadge
    pulls/          # PullList, PullCard, PullStatusBadge, CommentThread, MergePanel
    ui/             # shadcn primitives (button exists; add card, tabs, table, dialog, ... as needed)
  hooks/            # useViewer, useRepo, useCommits, usePulls, ...
  lib/api.ts        # typed fetch client
```

Behavior currently in `scripts.ts` (copy buttons, form submits, tab switching) becomes ordinary React event handlers on shadcn primitives (`Tabs`, `Button`, form components). `styles.ts` is not ported wholesale: layout/spacing become Tailwind utilities and colors/typography come from the shadcn theme variables; only genuinely bespoke rules (e.g. diff/file-tree specifics) move into `styles.css`.

### 6. Big-bang cutover, not page-by-page

All pages convert in one change; the HTML routes, `views/*` files, subpath exports, and `views.test.ts` snapshots are deleted at the end. Alternative — incremental per-page migration with both stacks live — rejected: keeping string-template and React stacks consistent (shared nav, styles, viewer state) doubles work for a codebase this size, and the route-precedence rules get messy. The change is large but mechanical, and tasks are ordered so the app stays green until the final cutover commit.

## Risks / Trade-offs

- [Parity gaps — 16 pages re-implemented from 2,500 lines of templates] → Use the existing templates as the source of truth while porting; verify each page against the running old implementation before deleting `views/`; keep an explicit page-by-page checklist in tasks.md.
- [SEO / no-JS users lose content (landing page especially)] → Accepted per the user's explicit "do not render from server" requirement; landing page is behind a wallet product where SEO matters little. Revisit with prerendering if needed.
- [Private repo flows regress (login/unlock were server-rendered interstitials)] → Specs pin the 401/403 → SPA redirect behavior; reuse the already-working React panels; add tests for unauthenticated access to a private repo URL.
- [Server static fallback shadows future API routes] → Fallback only answers `GET` + `Accept: text/html` and is registered after all other plugins; `/v1`, `/healthz`, and Git routes are explicitly excluded.
- [Docker/Railway image misses web assets] → Dockerfile already builds `@octopus/web` for views; add an explicit `vite build` + asset copy and update `watchPatterns`; healthcheck unchanged.
- [Shared package churn breaks CLI] → Only additive exports in shared; CLI untouched; `pnpm check` across workspaces gates it.

## Migration Plan

1. Add shared types + `/v1/viewer` + missing JSON endpoints (server still renders HTML — green).
2. Build SPA router, API client, components, and pages in `apps/web` (old pages still live — green).
3. Cutover: register SPA static serving + fallback, delete HTML rendering from routes, delete `views/*`, drop subpath exports, replace snapshot tests.
4. Rollback: revert the cutover commit — old HTML rendering returns since steps 1–2 are additive.

## Open Questions

- None blocking. If visual parity for the CSS port proves expensive, the fallback is shipping `styles.ts` content verbatim as a static stylesheet and converting to Tailwind in a follow-up change.
