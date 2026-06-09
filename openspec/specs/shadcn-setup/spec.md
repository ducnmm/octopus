# shadcn-setup Specification

## Purpose
TBD - created by archiving change setup-shadcn-web. Update Purpose after archive.
## Requirements
### Requirement: Tailwind CSS and build configuration
The web application SHALL be configured to use Tailwind CSS and PostCSS, and compiler configurations (TypeScript and Vite) SHALL support `@/*` path aliases mapping to the `./src/` directory.

#### Scenario: Tailwind CSS styles compile successfully
- **WHEN** the web application build or dev server is started
- **THEN** Tailwind utility classes are compiled into the application's stylesheet and rendered in the browser

#### Scenario: Path alias resolution
- **WHEN** a module is imported using the `@/` prefix (e.g., `@/components/ui/button`)
- **THEN** the compiler and bundler successfully resolve the import path to `src/`

### Requirement: Shadcn UI component initialization
The web application SHALL be initialized with shadcn/ui components configured via `components.json` and styled using Tailwind CSS custom color variables.

#### Scenario: Initialization configuration file exists
- **WHEN** the project is inspected
- **THEN** `components.json` is present in `apps/web/` defining the correct tailwind config path, global CSS path, and import alias settings

#### Scenario: Components conform to design tokens
- **WHEN** a shadcn component is rendered in the browser under light or dark mode
- **THEN** its background, foreground, border, and primary/accent colors dynamically adjust to match the system-wide prefers-color-scheme setting using the specified theme CSS variables

