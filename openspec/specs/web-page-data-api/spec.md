# web-page-data-api Specification

## Purpose
TBD - created by archiving change convert-views-to-react. Update Purpose after archive.
## Requirements
### Requirement: Viewer session endpoint

The server SHALL expose a JSON endpoint reporting the authenticated viewer derived from the web session cookie. The existing `GET /v1/auth/web-session` satisfies this: it SHALL return `{authenticated: true, accountId, walletAddress, unlockedRepoIds, expiresAtMs}` when a valid session cookie is present and `{authenticated: false}` when not. The endpoint MUST NOT render HTML, and the SPA SHALL use it as its single source of viewer identity.

#### Scenario: Signed-in viewer

- **WHEN** a request with a valid session cookie calls `GET /v1/auth/web-session`
- **THEN** the server responds `200` with `authenticated: true` and the viewer's wallet address as JSON

#### Scenario: Signed-out viewer

- **WHEN** a request without a valid session calls `GET /v1/auth/web-session`
- **THEN** the server responds `200` with `{authenticated: false}` (no redirect, no HTML)

### Requirement: Complete JSON coverage for page data

Every data need of the SPA pages SHALL be served by a `/v1/*` JSON endpoint: repo list, single-repo metadata (including refs and default branch), commits, tree, blob, activity, access settings, and the full pull request lifecycle (list, create, detail, comments, merge, close, reopen). Where an endpoint already exists it SHALL be reused; missing endpoints (at minimum single-repo metadata `GET /v1/repos/:owner/:repo`) SHALL be added.

#### Scenario: Single repo metadata as JSON

- **WHEN** the SPA calls `GET /v1/repos/:owner/:repo`
- **THEN** the server responds with the repo's metadata (name, owner, visibility, refs, default branch) as JSON

#### Scenario: Access errors are structured JSON

- **WHEN** a `/v1` request targets a private repo the requester cannot read
- **THEN** the server responds `401` or `403` with a structured JSON error code (no HTML interstitial), sufficient for the SPA to choose the login vs unlock flow

### Requirement: Server serves the SPA bundle with history fallback

The server SHALL serve the built web application assets and SHALL respond with the SPA's `index.html` for any `GET` request that accepts `text/html` and does not match a Git smart-HTTP route, a `/v1/*` route, `/healthz`, or a static asset. Git protocol requests and JSON API requests MUST NOT be shadowed by the fallback.

#### Scenario: Page URL returns the SPA shell

- **WHEN** a browser requests `GET /:owner/:repo` with `Accept: text/html`
- **THEN** the server responds `200` with the SPA `index.html`

#### Scenario: Git smart-HTTP unaffected

- **WHEN** a Git client requests `GET /:owner/:repo/info/refs?service=git-upload-pack`
- **THEN** the Git smart-HTTP handler responds, not the SPA fallback

#### Scenario: API routes unaffected

- **WHEN** a client requests any `/v1/*` or `/healthz` path
- **THEN** the JSON handler responds and the fallback never matches

