## Context

The UI view layer (`apps/server/src/views/`) renders HTML pages on the server (dashboard, repository views, pull requests, etc.) using template-literal functions. Currently, these files are part of `@octopus/server`. Moving them to `@octopus/web` separates the presentation layer (CSS, HTML templates, client-side wallet scripts) from the core backend logic (routes, services, repositories).

## Goals / Non-Goals

**Goals:**
- Move all files under `apps/server/src/views` to `apps/web/src/views`.
- Configure package exports in `@octopus/web` to expose these views for the server.
- Add `@octopus/web` as a dependency of `@octopus/server` and update server imports.
- Maintain identical page HTML output, styles, and client scripts.
- Support both development (`tsx watch`) and production (`node dist/...`) builds.

**Non-Goals:**
- Do not rewrite the views as React components.
- Do not modify the routing or logic of the Fastify server.
- Do not change any page layout, styling, or functionality.

## Decisions

### 1. Subpath Exports in `@octopus/web` package.json
To allow `@octopus/server` to import `@octopus/web/views/pages.js` (and `styles.js`, `scripts.js`), we will define explicit exports in `apps/web/package.json`:
```json
  "exports": {
    "./views/pages.js": {
      "types": "./dist/views/pages.d.ts",
      "import": "./dist/views/pages.js"
    },
    "./views/scripts.js": {
      "types": "./dist/views/scripts.d.ts",
      "import": "./dist/views/scripts.js"
    },
    "./views/styles.js": {
      "types": "./dist/views/styles.d.ts",
      "import": "./dist/views/styles.js"
    }
  }
```
This is fully compliant with ESM (`NodeNext`) resolution and enables clean imports.

*Alternative considered:* Using a wildcard export like `"./views/*": "./dist/views/*"`. While simpler, explicit mapping provides better discoverability and autocomplete.

### 2. TS Compilation Build Order in `@octopus/web`
In `apps/web/package.json`, the build script currently is `tsc -p tsconfig.json && vite build`. Since `vite build` empties the `dist` folder by default, it would delete the compiled JS files produced by `tsc`.
We will change the build script to run `tsc` *after* Vite builds:
```json
  "build": "vite build && tsc -p tsconfig.json"
```
This ensures the compiled `dist/views/` files and their `.d.ts` declaration maps are preserved.

*Alternative considered:* Configuring Vite's `build.emptyOutDir: false`. This is more fragile as it may leave stale assets from previous Vite builds.

### 3. Sibling Package Type Imports
The moved views need to import types from the server (e.g., `SuiRepoState`, `IndexedCommit`). We will use relative path imports pointing back to the server package files:
`import type { SuiRepoState } from "../../../server/src/sui.js";`
Since these are `import type` statements, they are erased at compile time and will not cause bundler or runtime issues in Vite.

*Alternative considered:* Adding `@octopus/server` as a devDependency in `@octopus/web`. This can introduce dependency cycles and is unnecessary since relative type imports are resolved by TypeScript without issues.

## Risks / Trade-offs

- **[Risk]** Production build fails to resolve `@octopus/web/views/pages.js` at runtime.
  - **Mitigation:** Run `pnpm build` across the monorepo and verify `apps/web/dist/views/` contains the generated `.js` files, then boot the server using `pnpm start`.
- **[Risk]** Relative type paths break if view files are reorganized further.
  - **Mitigation:** Keep the relative paths clear and verify with `pnpm check`.
