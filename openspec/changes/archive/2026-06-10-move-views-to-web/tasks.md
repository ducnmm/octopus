## 1. Move View Files and Resolve Types

- [x] 1.1 Move `pages.ts`, `scripts.ts`, and `styles.ts` from `apps/server/src/views/` into `apps/web/src/views/`.
- [x] 1.2 Update type imports in `apps/web/src/views/pages.ts` to reference server types using relative paths (`../../../server/src/...`).

## 2. Configure Monorepo Dependency and Exports

- [x] 2.1 Add `@octopus/web` as a dependency in `apps/server/package.json`.
- [x] 2.2 Configure `exports` for `views` files (`pages.js`, `scripts.js`, `styles.js`) in `apps/web/package.json`.
- [x] 2.3 Modify the `build` script in `apps/web/package.json` to run `tsc` after `vite build`.

## 3. Update Server Routes and Remove Old Views

- [x] 3.1 Update view imports in `apps/server/src/routes/repo-routes.ts` to `@octopus/web/views/pages.js`.
- [x] 3.2 Update view imports in `apps/server/src/routes/pull-request-routes.ts` to `@octopus/web/views/pages.js`.
- [x] 3.3 Update view imports in `apps/server/src/routes/route-context.ts` to `@octopus/web/views/pages.js`.
- [x] 3.4 Delete the directory `apps/server/src/views/` and its old files.

## 4. Update Specification Files

- [x] 4.1 Update `openspec/specs/server-module-architecture/spec.md` to reflect the views relocation.

## 5. Verification

- [x] 5.1 Run workspace-wide type checks using `pnpm check`.
- [x] 5.2 Run workspace build using `pnpm build`.
- [x] 5.3 Run existing tests with `pnpm test` to ensure behavior is unchanged.
