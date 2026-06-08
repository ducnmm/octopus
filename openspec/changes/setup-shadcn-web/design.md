## Context

The web application is built with Vite, React 19, and TypeScript. Currently, it relies on global CSS rules in `src/styles.css`. To support faster, cleaner, and standard UI development, we need to introduce `shadcn/ui`, which depends on Tailwind CSS.

## Goals / Non-Goals

**Goals:**
- Configure Tailwind CSS, PostCSS, and Autoprefixer inside `apps/web`.
- Configure `@/*` path alias in both TypeScript (`tsconfig.json`) and Vite (`vite.config.ts`).
- Run `shadcn` initialization to create `components.json` and initialize utility helper functions (`lib/utils.ts`).
- Integrate the existing design tokens (e.g. colors, font sizes, transitions, custom backdrop, card styles) from `styles.css` as custom Tailwind CSS variables.
- Verify the build and dev server compile without errors.

**Non-Goals:**
- Complete rewrite of all existing panels (`CliLoginPanel`, `WebLoginPanel`, etc.) using shadcn components. The existing layout and styles should remain intact.
- Changing the existing UI behavior or state management.

## Decisions

### 1. Tailwind Integration Method
We will install Tailwind CSS v3 (or standard v4 if CLI defaults to it) with postcss and autoprefixer, and import Tailwind in a new global CSS file or at the top of the existing `styles.css` file.
*Alternatives Considered:*
- Tailwind CSS v4 using the new `@tailwindcss/vite` plugin: Excellent but might have minor compatibility friction with older tsconfig setups. We will use the standard PostCSS configuration as it's highly robust and integrates seamlessly with the existing project workspace structure.

### 2. Path Alias Configuration
We will configure Vite's built-in `resolve.alias` mapping `@` to the `src` directory in `vite.config.ts`, and add `baseUrl` and `paths` in `apps/web/tsconfig.json`.
*Alternatives Considered:*
- Using `vite-tsconfig-paths` plugin: It avoids duplication but adds a dev dependency. Using Vite's built-in `resolve.alias` keeps dependencies minimal.

### 3. Styling Conflict Resolution
Tailwind CSS includes a global CSS reset (`preflight`). To prevent this from breaking existing handcrafted UI styles, we will import Tailwind directives at the top of the stylesheet and load the custom styles after them, overriding where necessary.

## Risks / Trade-offs

- **Tailwind Preflight overriding existing styles:**
  - *Mitigation:* Ensure preflight is enabled, but review any elements (like buttons and headers) that might get reset. Since we use explicit class names and custom variables for the existing components, style conflicts should be minimal. We will verify layout integrity manually on the dev server.
- **Import paths mismatch in mono-repo:**
  - *Mitigation:* Explicitly verify path resolution settings in `apps/web` without affecting the other packages in the pnpm workspace.
