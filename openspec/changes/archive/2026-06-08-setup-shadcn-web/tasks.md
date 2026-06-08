## 1. Setup and Path Alias Configuration

- [x] 1.1 Add required devDependencies (tailwindcss, postcss, autoprefixer, etc.) to `apps/web/package.json`
- [x] 1.2 Update `tsconfig.json` in `apps/web` to include `"paths"` mapping `@/*` to `"src/*"` and `"baseUrl"` to `"."`
- [x] 1.3 Update `vite.config.ts` in `apps/web` to add resolve alias for `@` pointing to `src`

## 2. Shadcn Initialization and Theme Styling

- [x] 2.1 Initialize shadcn inside `apps/web` by configuring `components.json` and tailwind configuration files
- [x] 2.2 Define Tailwind CSS theme colors, fonts, and dark mode configuration in tailwind config file
- [x] 2.3 Set up shadcn utility functions in `src/lib/utils.ts` and set up the global tailwind stylesheet
- [x] 2.4 Integrate existing color/gradient design tokens from `styles.css` into the tailwind base/theme variables

## 3. Component Verification and Build

- [x] 3.1 Install a test shadcn component (e.g. Button) to verify components install and import correctly
- [x] 3.2 Add the test component to `App.tsx` or a test page to verify it renders with the correct theme
- [x] 3.3 Run build and typecheck inside `apps/web` to verify there are no compilation errors
