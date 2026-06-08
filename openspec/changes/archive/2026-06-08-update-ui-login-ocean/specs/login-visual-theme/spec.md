## ADDED Requirements

### Requirement: Ocean-with-octopus login backdrop

The full-page wallet login surface SHALL display an ocean-with-octopus image as
the backdrop behind the auth panel, on every full-page auth panel (Authorize CLI
Delegate, Sign in to Octopus, and Unlock Repository).

#### Scenario: Backdrop visible on full-page login

- **WHEN** a user opens any full-page login panel
- **THEN** the ocean-with-octopus artwork is rendered as the page backdrop
- **AND** the artwork covers the full viewport without distorting its aspect ratio

#### Scenario: Backdrop applied to all auth panels

- **WHEN** the app renders the Authorize CLI Delegate, Sign in, or Unlock
  Repository panel as a full page
- **THEN** each panel shows the same ocean-with-octopus backdrop treatment

### Requirement: Light and dark backdrop variants

The login backdrop SHALL follow the user's `prefers-color-scheme` setting,
showing a light-mode variant and a dark-mode variant of the ocean artwork.

#### Scenario: Dark mode backdrop

- **WHEN** the user's system is set to dark color scheme
- **THEN** the login shows the dark variant of the ocean-with-octopus artwork

#### Scenario: Light mode backdrop

- **WHEN** the user's system is set to light color scheme
- **THEN** the login shows the light variant of the ocean-with-octopus artwork

### Requirement: Readable auth panel over artwork

The auth panel and its contents (heading, detail rows, buttons, and status
messages) SHALL remain legible when displayed over the ocean backdrop, meeting
normal text contrast expectations.

#### Scenario: Form controls remain usable

- **WHEN** the auth panel is shown over the ocean backdrop
- **THEN** the heading, labels, connect/authorize buttons, and status text are
  fully readable
- **AND** all existing controls remain interactive and unchanged in behavior

### Requirement: Embedded auth mode excluded from ocean theme

The ocean backdrop treatment SHALL NOT apply when the auth panel runs in
`embedded-auth` mode, which renders the panel as a 1px hidden element.

#### Scenario: Embedded mode stays hidden

- **WHEN** the auth panel renders in `embedded-auth` mode
- **THEN** no ocean backdrop is shown
- **AND** the panel remains the existing 1px hidden footprint
