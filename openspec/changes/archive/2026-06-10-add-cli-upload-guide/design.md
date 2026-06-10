## Context

When a user creates a new repository on the platform, they are currently left without clear next steps to get their code pushed from their local machine. GitHub and similar platforms provide a set of standard CLI commands to initialize a repository, add a remote, and push code. This change aims to replicate that onboarding step.

## Goals / Non-Goals

**Goals:**
- Provide clear, copy-pasteable CLI commands to push an existing local repository.
- Provide clear, copy-pasteable CLI commands to initialize and push a new local repository.
- Display the repository's HTTP/SSH clone URL dynamically based on the newly created repository's data.

**Non-Goals:**
- Handling repository code imports from other platforms (e.g., GitHub, GitLab).
- Displaying these instructions once the repository already has commits/files.

## Decisions

1. **Empty Repository State Component**: Instead of creating a separate route for setup instructions, we will enhance the existing repository view (`apps/web`). If the repository has zero commits or files, we will render a `RepositorySetupGuide` component instead of an empty file tree.
   - *Alternative*: Redirecting to a dedicated `/setup` page. *Why rejected*: It is cleaner to keep the user on the repository URL and naturally transition to the code view once code is pushed.

2. **Fetching Clone URL**: The web app needs to construct or fetch the correct clone URL for the repository. The server API already provides the repository name and owner, which can be used to construct the URL, or the backend can explicitly return `cloneUrl` in the repository entity.

## Risks / Trade-offs

- **Risk**: The user pushes code but the UI doesn't update automatically.
  - **Mitigation**: The user can manually refresh the page. We could add a polling mechanism to check if the repository is no longer empty, but for the initial version, a manual refresh or a "Refresh" button is sufficient.
