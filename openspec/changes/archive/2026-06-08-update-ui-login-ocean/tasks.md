## 1. Prepare ocean artwork assets

- [x] 1.1 Create web-optimized light and dark login backdrops from the source
  octopus-underwater art (resize/compress, prefer WebP, target well under the
  ~1.8 MB originals)
- [x] 1.2 Add the light and dark backdrop files to `apps/web/public/` (e.g.
  `login-ocean.webp` and `login-ocean-dark.webp`)

## 2. Apply ocean backdrop in styles

- [x] 2.1 In `apps/web/src/styles.css`, set the light backdrop on `.auth-shell`
  with `background-size: cover` and centered position covering the full viewport
- [x] 2.2 Add the dark backdrop override inside the existing
  `@media (prefers-color-scheme: dark)` block
- [x] 2.3 Add an optional scrim/overlay on `.auth-shell` only if needed to keep
  contrast in the busiest area of the artwork

## 3. Make the auth card readable over artwork

- [x] 3.1 Restyle `.auth-card` to a translucent/elevated panel (semi-transparent
  surface, backdrop blur, subtle shadow/border) while keeping token-driven text
  colors
- [x] 3.2 Verify heading, detail rows, connect/authorize buttons, and
  status/success/error text remain legible in both light and dark modes

## 4. Preserve embedded mode

- [x] 4.1 Confirm the `embedded-auth` overrides still null out the backdrop and
  keep the 1px hidden footprint (adjust selector specificity/order if the new
  `.auth-shell` rules leak in)

## 5. Verify

- [x] 5.1 Run `pnpm dev:web` and check all three full-page panels (Authorize CLI
  Delegate, Sign in, Unlock Repository) show the backdrop with a readable card
- [x] 5.2 Toggle system light/dark and confirm the correct variant loads
- [x] 5.3 Run `pnpm --filter @octopus/web check` and `pnpm --filter @octopus/web
  build` to confirm typecheck and bundle succeed
