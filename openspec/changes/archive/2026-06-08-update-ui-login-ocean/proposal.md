# Update UI Login Ocean

## Why

The wallet login app (`apps/web`) renders every auth panel as a plain white card
on a flat canvas background, with no connection to the Octopus brand. The project
already ships polished octopus-underwater artwork (used by the server's own HTML
pages), but the login surface — the first screen a developer authenticates
through — shows none of it. Bringing the ocean-with-octopus scene into the login
makes the flow feel like part of Octopus and gives it visual identity at the
moment of first impression.

## What Changes

- Add an immersive ocean-with-octopus backdrop behind the login surface, with
  light and dark variants that follow `prefers-color-scheme`.
- Restyle the auth card to read clearly over the artwork (e.g. a translucent /
  elevated panel) while keeping the existing form controls, labels, and status
  messages intact.
- Apply the new backdrop to all three full-page panels (Authorize CLI Delegate,
  Sign in to Octopus, Unlock Repository) consistently.
- Preserve the existing `embedded-auth` 1px hidden mode — the ocean treatment
  must not apply when the panel is embedded.
- Make the ocean artwork available to the web app's bundle/static assets (the
  images currently live only under `apps/server/assets`).

## Capabilities

### New Capabilities
- `login-visual-theme`: Defines the visual presentation requirements for the
  wallet login surface — ocean-with-octopus backdrop, light/dark behavior,
  readable auth panel, and embedded-mode exclusion.

### Modified Capabilities
<!-- None: no existing specs in openspec/specs/. -->

## Impact

- `apps/web/src/styles.css`: backdrop, theming, and auth-card presentation.
- `apps/web/src/App.tsx` and/or `index.html`: only if markup hooks are needed for
  the backdrop layer (logic and flow unchanged).
- `apps/web/public/` (or `src/assets`): octopus-underwater artwork added to the
  web app's static assets.
- No change to auth logic, API calls, credentials handling, or the CLI/server.
- Performance note: the source artwork is ~1.8 MB per variant; sizing/optimizing
  for web delivery is in scope.
