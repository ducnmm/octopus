## Why

The server UI view layer (HTML templates, client-side scripts, and styles) currently resides inside `apps/server/src/views`. Moving these views to `apps/web` consolidates all user-facing web interface concerns under the frontend package, laying the foundation for a unified web application and separating the backend API/Git-HTTP concerns from page presentation logic.

## What Changes

- Relocate all view files from `apps/server/src/views` (`pages.ts`, `scripts.ts`, `styles.ts`) into `apps/web/src/views`.
- Expose these view modules from `@octopus/web` via subpath exports in `apps/web/package.json` so they can be consumed by `@octopus/server`.
- Add `@octopus/web` as a dependency in `@octopus/server/package.json` to allow importing views from `@octopus/web/views/pages.js` (and styles/scripts).
- Update all imports of views in `@octopus/server/src/routes/` and `@octopus/server/src/routes/route-context.ts` to reference `@octopus/web/views/...` instead of local relative paths.
- Ensure TypeScript compiling and runtime execution (via `tsx watch` and built `dist`) function seamlessly in both development and production.

## Capabilities

### New Capabilities

<!-- None: no new specs or capabilities are being introduced. -->

### Modified Capabilities

- `server-module-architecture`: Relocate the views layer out of the server package (`apps/server/src/views`) and into the web package (`apps/web/src/views`) while preserving Fastify routes and context structures.

## Impact

- `apps/server/package.json`: Add `@octopus/web` as a workspace dependency.
- `apps/web/package.json`: Expose `./views/pages.js`, `./views/scripts.js`, `./views/styles.js` via package exports.
- `apps/server/src/routes/repo-routes.ts`: Update views imports to `@octopus/web/views/pages.js`.
- `apps/server/src/routes/pull-request-routes.ts`: Update views imports to `@octopus/web/views/pages.js`.
- `apps/server/src/routes/route-context.ts`: Update views imports to `@octopus/web/views/pages.js`.
- `apps/server/src/views/`: Delete the folder and its contents (`pages.ts`, `scripts.ts`, `styles.ts`) after moving them.
- `apps/web/src/views/`: New home for `pages.ts`, `scripts.ts`, `styles.ts`.
- `openspec/specs/server-module-architecture/spec.md`: Update architectural description of the view layer's location.
