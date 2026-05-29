# Traceability

Use this table to keep implementation tied to specs.

| Feature | Spec | Acceptance | Code Location | Status |
| --- | --- | --- | --- | --- |
| Auth login | `protocols/auth.md` | `acceptance/auth-login.md` | `apps/cli`, `apps/server`, `contracts/sui` | Spec ready |
| Repo create | `protocols/auth.md`, `protocols/sui-registry.md` | `acceptance/repo-create.md` | `apps/cli`, `apps/server`, `contracts/sui` | Spec ready |
| Git push | `protocols/git-http.md` | `acceptance/push-and-anchor.md` | `apps/server` | Spec ready |
| Walrus artifact | `protocols/walrus-storage.md` | `acceptance/push-and-anchor.md` | `apps/server`, `packages/shared` | Spec ready |
| Sui ref anchor | `protocols/sui-registry.md` | `acceptance/push-and-anchor.md` | `contracts/sui`, `apps/server` | Spec ready |
| Restore | `protocols/restore-flow.md` | `acceptance/restore-from-walrus-sui.md` | `apps/server`, `apps/cli`, `apps/indexer` | Spec ready |
| Web file and commit browser | `01-mvp-scope.md`, `03-architecture.md` | `acceptance/push-and-anchor.md` | `apps/server/src/indexer.ts`, `apps/server/src/web.ts` | Implemented |
| Private repo MVP | `protocols/private-repos.md` | `acceptance/push-and-anchor.md` | `apps/server`, `apps/web`, `contracts/sui` | Implemented MVP |
