# Convert Server-Rendered Views to a React SPA

## Why

All user-facing pages (landing, dashboard, repo browser, commits, blobs, pull requests, access settings) are produced by ~6,000 lines of string-template HTML in `apps/web/src/views/` (`pages.ts`, `scripts.ts`, `styles.ts`) and rendered server-side by Fastify routes. This is hard to maintain (one 2,489-line `pages.ts`, hand-written inline scripts, no component reuse) and splits the web UX between two paradigms — the wallet login/unlock flow is already React 19 + Vite. Converting every page to client-rendered React components unifies the frontend, enables component reuse, and removes HTML presentation concerns from the server entirely.

## What Changes

- Rebuild every page currently rendered by `views/pages.ts` as React components in `apps/web` (landing, create repo, dashboard, repo list, owner profile, private-repo login/unlock, repo home, commits, blob, activity, access settings, PR list/create/detail), decomposed into reusable components (layout shell, nav, repo header, file tree, commit list, PR cards, etc.) built on the already-initialized shadcn/ui primitive set.
- Add client-side routing to the web app so URLs like `/:owner/:repo`, `/:owner/:repo/pulls/:n` resolve in the browser; pages fetch their data from the server's existing `/v1/*` JSON API.
- Add the small number of missing JSON endpoints the SPA needs (e.g. a viewer/session endpoint exposing the logged-in `WebViewer`; ensure repo page, commits, tree, blob, activity, access, and PR data are all reachable as JSON — most already exist under `/v1/`).
- **BREAKING**: Server no longer renders HTML. The HTML-rendering branches in `repo-routes.ts`, `pull-request-routes.ts`, and `route-context.ts` are removed. The server instead serves the built SPA bundle (static assets + `index.html` fallback) for page URLs, keeping existing links working.
- Remove the `@octopus/web/views/*` subpath exports and delete `views/pages.ts`, `views/scripts.ts`, `views/styles.ts`, `views/types.ts`. Shared types/helpers the server still needs (`WebViewer`, `RepoListItem`, `toRepoListItem`) move to `@ducnmm/octopus-shared`.
- Replace the server-side HTML snapshot tests (`apps/server/test/views.test.ts`) with web-side component tests.

## Capabilities

### New Capabilities

- `web-spa-pages`: Client-rendered React pages and routing for the full Octopus web UI — page inventory, component decomposition, data fetching from `/v1` JSON endpoints, auth/viewer awareness, and private-repo login/unlock flows in the SPA.
- `web-page-data-api`: JSON endpoints that back the SPA — the viewer/session endpoint and the contract that every page's data need is met by a `/v1/*` JSON route; SPA static-asset serving with `index.html` fallback.

### Modified Capabilities

- `server-module-architecture`: The server's view layer requirement changes — the server no longer imports or renders HTML views from `@octopus/web/views/*`; it serves JSON APIs, Git smart-HTTP, and the static SPA bundle only.

## Impact

- `apps/web/src/`: New `pages/`, `components/` additions, client router, data-fetching hooks; `views/` directory deleted once parity is reached.
- `apps/web/package.json`: Remove `./views/*` exports; add a router dependency (e.g. `react-router`).
- `apps/server/src/routes/repo-routes.ts`, `pull-request-routes.ts`, `route-context.ts`: Remove HTML rendering; add/keep JSON endpoints; add SPA static serving + fallback.
- `apps/server/src/plugins/auth-context.ts`, `services/repo-service.ts`: Switch `WebViewer` / `toRepoListItem` imports to `@ducnmm/octopus-shared`.
- `packages/shared/src/`: Gains `WebViewer`, `RepoListItem`, and repo-state mapping helpers (rebuild shared before downstream — see CLAUDE.md gotcha).
- `apps/server/test/views.test.ts` + snapshots: Deleted; replaced by web component tests.
- `Dockerfile` / deployment: Runtime image must include the built web SPA assets so the server can serve them; `watchPatterns` in `railway.json` should add `apps/web/**`.
- Supersedes the remaining cleanup of the in-flight `move-views-to-web` change (the moved string-template views are deleted rather than kept).
