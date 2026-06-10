## 1. UI Component Creation

- [x] 1.1 Create `RepositorySetupGuide` component in `apps/web` (Implemented in apps/server/src/views/pages.ts)
- [x] 1.2 Implement "Create a new repository on the command line" section with commands
- [x] 1.3 Implement "Push an existing repository from the command line" section with commands
- [x] 1.4 Add basic styling to make commands copy-pasteable

## 2. Integration into Repository View

- [x] 2.1 Update the repository page/view to check if the repository is empty (no commits/files)
- [x] 2.2 Construct the correct HTTP clone URL using the repository owner and name
- [x] 2.3 Render `RepositorySetupGuide` with the clone URL when the repository is empty

## 3. Verification

- [x] 3.1 Create a new repository and verify the setup guide is displayed
- [x] 3.2 Verify the clone URL is correct in the displayed CLI commands
- [x] 3.3 Verify that pushing code to the repository and refreshing the page hides the guide and shows the code
