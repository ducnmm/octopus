## Why

Users currently lack clear instructions on how to push their local code to a newly created repository on the platform. Providing a setup guide with CLI instructions immediately after repository creation (similar to GitHub) will significantly improve the onboarding experience and reduce friction in getting code onto the platform.

## What Changes

- Add a new page/view that displays immediately after a user creates a new repository.
- Provide copy-pasteable CLI commands for:
  - Creating a new repository on the command line
  - Pushing an existing repository from the command line
- Include the repository's remote URL in the instructions.

## Capabilities

### New Capabilities
- `repo-creation-cli-guide`: Adds a setup guide page with CLI instructions for newly created repositories.

### Modified Capabilities


## Impact

- **UI/Web**: New route/page for empty repository setup instructions.
- **Server**: May need an API to fetch the repository clone URL if not already available in the repo creation response.
