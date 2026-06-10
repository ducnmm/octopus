# repo-creation-cli-guide Specification

## Purpose
TBD - created by archiving change add-cli-upload-guide. Update Purpose after archive.
## Requirements
### Requirement: Empty Repository Setup Instructions
The system SHALL display CLI setup instructions when a user views an empty repository (a repository with no commits/files).

#### Scenario: Viewing a newly created repository
- **WHEN** a user navigates to the repository page of an empty repository
- **THEN** the system displays a setup guide instead of a file tree
- **AND** the guide includes CLI commands for "Create a new repository on the command line"
- **AND** the guide includes CLI commands for "Push an existing repository from the command line"

### Requirement: Clone URL Interpolation
The setup instructions SHALL include the correct clone URL for the repository in the `git remote add` commands.

#### Scenario: Copying remote add command
- **WHEN** the user views the setup instructions
- **THEN** the `git remote add origin` command includes the correct repository URL (e.g. `http://<host>/<owner>/<repo>.git` or equivalent)

