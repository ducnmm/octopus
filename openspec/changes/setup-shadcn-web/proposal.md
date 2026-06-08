## Why

The web application (`apps/web`) currently uses plain CSS rules for UI styling. Integrating the shadcn/ui framework (powered by Tailwind CSS) will establish a robust, accessible, and themeable UI component system to support rich visual design and accelerated frontend development.

## What Changes

- Configure Tailwind CSS, PostCSS, and autoprefixer in `apps/web`.
- Configure TypeScript path aliases (`@/*`) in `tsconfig.json` and configure Vite resolver aliases in `vite.config.ts`.
- Initialize `shadcn/ui` with `components.json` configuration inside `apps/web`.
- Ensure shadcn/ui CSS variables align with the existing color schemes (e.g., the ocean visual theme and light/dark mode requirements).

## Capabilities

### New Capabilities
- `shadcn-setup`: Framework and tooling setup for shadcn/ui components in the web application.

### Modified Capabilities
