## Context

The wallet login app (`apps/web`) is a small React 19 + Vite app. All visual
styling lives in `apps/web/src/styles.css`; the three auth panels in
`apps/web/src/App.tsx` (`ApprovePanel`, `SignInPanel`, `UnlockRepoPanel`) share
the same markup shell: `<main className="auth-shell"><section
className="auth-card">…`. The current look is a plain white/dark card centered on
a flat `--canvas-default` background.

Octopus already ships octopus-underwater artwork under `apps/server/assets/`
(`octopus-underwater-bg.png` ~1.8 MB and `octopus-underwater-bg-dark.png`
~1.6 MB), used by the server's server-rendered HTML pages — but the web login app
has no access to those files and no brand artwork of its own. The web app serves
static files from `apps/web/public/`.

There is also an `embedded-auth` mode: when the panel is embedded, `.auth-shell`
/ `.auth-card` collapse to a 1px hidden element so the flow can run invisibly.
Any backdrop work must not break that.

## Goals / Non-Goals

**Goals:**
- Put the ocean-with-octopus scene behind the login on full-page panels.
- Support light/dark variants via `prefers-color-scheme`.
- Keep the auth card and all controls fully readable and unchanged in behavior.
- Leave `embedded-auth` (1px hidden) mode untouched.

**Non-Goals:**
- No change to auth logic, API calls, credential handling, or the CLI/server.
- No redesign of the form layout, copy, or control set beyond making the card
  legible over artwork.
- No new runtime dependency or component framework.

## Decisions

### Backdrop via CSS on the existing `.auth-shell`, not new markup
Apply the background image to `.auth-shell` (the full-page `<main>`) using
`background-image` + `background-size: cover` + `background-position: center`.
This requires zero changes to `App.tsx` and automatically covers all three panels
since they share the shell. The `embedded-auth` selector already overrides
`.auth-shell`, so we add the backdrop in a way that the embedded override wins
(embedded keeps its 1px/no-background rules).

Alternative considered: a dedicated `<div>` backdrop layer in `App.tsx`. Rejected
— it touches component markup for all three panels and adds nothing over a CSS
background for a static image.

### Light/dark via `prefers-color-scheme` media query
Define the light artwork on the base `.auth-shell` rule and override with the
dark artwork inside the existing `@media (prefers-color-scheme: dark)` block, the
same mechanism the stylesheet already uses for its color tokens.

### Readable card via translucent elevated panel
Change `.auth-card` from an opaque canvas fill to a semi-translucent surface with
backdrop blur and a subtle shadow/border so the ocean shows through the page
while text sits on a legible panel. Keep all token-driven text colors. Add a
slight scrim/overlay on `.auth-shell` if needed to guarantee contrast in the
busiest area of the artwork.

Alternative considered: fully opaque card (no transparency). Rejected — it would
hide most of the "more ocean" the request asks for. Translucency keeps the scene
visible while protecting legibility.

### Asset delivery: copy + optimize into `apps/web/public/`
Copy the two underwater PNGs into `apps/web/public/` (e.g.
`public/login-ocean.<webp|png>` and a `-dark` variant) and reference them with
root-absolute URLs from CSS. Prefer a web-optimized/resized export (target
well under the ~1.8 MB source) to keep first paint fast. Vite serves `public/`
at the site root, so no import wiring is needed.

Alternative considered: importing from `apps/server/assets` across packages.
Rejected — cross-package asset reach-through is fragile and the server image is
unoptimized for this use.

## Risks / Trade-offs

- [Large image hurts first paint / login latency] → Export a resized,
  compressed variant (WebP where possible) and keep it small; the login is the
  critical path to authenticating.
- [Low text contrast over busy artwork] → Use a translucent card with blur plus
  an optional scrim layer; verify heading, labels, buttons, and error/success
  status text in both light and dark.
- [Embedded mode accidentally gains a background] → Confirm the `embedded-auth`
  overrides still null out background/size after the new rules; the embedded
  selector must come after or be specific enough to win.
- [Asset duplication between server and web] → Accept one copy in the web app;
  the server copy serves a different surface and optimization target.

## Open Questions

- Reuse the exact server underwater PNGs (resized) or produce a login-specific
  crop framed around the octopus? Default: reuse and resize unless the framing
  looks wrong at full-bleed.
