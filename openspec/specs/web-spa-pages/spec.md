# web-spa-pages Specification

## Purpose
TBD - created by archiving change convert-views-to-react. Update Purpose after archive.
## Requirements
### Requirement: All web pages render client-side as React components

The web application SHALL render every user-facing page (landing, create repo, dashboard, repo list, owner profile, repo home, commits, blob, activity, access settings, pull request list/create/detail, private-repo login and unlock) as React components in `apps/web`. No page markup SHALL be produced by server-side string templates, and the modules `apps/web/src/views/pages.ts`, `scripts.ts`, `styles.ts`, and `types.ts` SHALL be removed.

#### Scenario: Page is rendered in the browser

- **WHEN** a user navigates to any Octopus page URL in a browser
- **THEN** the server responds with the SPA shell (`index.html` + assets) and the page content is rendered client-side by a React component

#### Scenario: Legacy view modules are gone

- **WHEN** the `apps/web` and `apps/server` sources are inspected after the change
- **THEN** no `render*Page` string-template functions exist and no module imports `@octopus/web/views/*`

### Requirement: Client-side routing preserves existing URL scheme

The SPA SHALL use a client-side router whose routes match the current server URL scheme exactly: `/`, `/new`, `/login`, `/:owner`, `/:owner/:repo`, `/:owner/:repo/commits`, `/:owner/:repo/blob/...`, `/:owner/:repo/activity`, `/:owner/:repo/settings/access`, `/:owner/:repo/pulls`, `/:owner/:repo/pulls/new`, and `/:owner/:repo/pulls/:number`. In-app navigation SHALL occur without full page reloads.

#### Scenario: Deep link resolves client-side

- **WHEN** a user opens a deep link such as `/:owner/:repo/pulls/3` directly
- **THEN** the SPA boots, matches the route, fetches the pull request data, and renders the PR detail page

#### Scenario: Existing auth panel URLs keep working

- **WHEN** a user opens `/login` with `mode=cli|web|unlock|access` query params
- **THEN** the existing CLI login, web login, unlock, and repo access panels render unchanged

### Requirement: Pages are decomposed into reusable components built on shadcn/ui

Each page SHALL be composed from reusable components rather than monolithic markup, with shadcn/ui as the primitive layer: UI primitives (buttons, cards, inputs, selects, tabs, badges, tables, dialogs, skeletons, breadcrumbs, alerts, toasts) SHALL be shadcn/ui components installed under `src/components/ui/` per the existing `components.json` configuration, and domain components MUST NOT hand-roll equivalents of primitives shadcn provides. At minimum the SPA SHALL provide a shared layout shell (top navigation with viewer state, page container, footer) used by all pages, and domain components (repo header, ref selector, file tree, commit list, pull request card, comment thread) shared across the pages that need them. Interactive behavior previously emitted by `scripts.ts` (copy-to-clipboard, form submission, tab switching) SHALL be implemented as React event handlers on these components.

#### Scenario: Shared layout wraps all pages

- **WHEN** any page route renders
- **THEN** it renders inside the shared layout shell showing navigation and, when signed in, the viewer identity

#### Scenario: Primitives come from shadcn/ui

- **WHEN** a page needs a standard primitive such as a button, form input, tab strip, dialog, or table
- **THEN** it uses the shadcn/ui component from `src/components/ui/` (added via the shadcn CLI when missing) rather than a bespoke implementation

#### Scenario: No inline script strings

- **WHEN** the SPA bundle source is inspected
- **THEN** no behavior is delivered via server-emitted inline `<script>` template strings

### Requirement: Pages fetch their data from JSON endpoints

Each page component SHALL obtain its data by calling the server's `/v1/*` JSON endpoints through a typed API client using same-origin credentials, and SHALL render explicit loading and error states while data is pending or unavailable.

#### Scenario: Repo page loads from API

- **WHEN** the repo home page mounts for `/:owner/:repo`
- **THEN** it fetches repo metadata, refs, and tree/README data from `/v1` endpoints and renders them, showing a loading state until resolved

#### Scenario: API failure is surfaced

- **WHEN** a page's data request fails with a server error
- **THEN** the page renders an error component with the failure context instead of a blank screen

### Requirement: Private repository access flows run in the SPA

WHEN a viewer without access opens a private repository page, the SPA SHALL detect the `401`/`403` JSON response and route the user to the in-app login or unlock flow (reusing the existing login/unlock panels), then return the user to the originally requested page after success.

#### Scenario: Unauthenticated viewer hits a private repo

- **WHEN** a signed-out user opens a private repo URL and the data request returns `401`
- **THEN** the SPA shows the login flow and, after successful login, navigates back to the requested repo page

#### Scenario: Signed-in viewer without a session key

- **WHEN** a signed-in user's request for private repo data returns `403` indicating a locked session
- **THEN** the SPA shows the unlock flow for that repository

