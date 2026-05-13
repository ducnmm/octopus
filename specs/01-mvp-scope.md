# MVP Scope

## In Scope

1. `gitwal auth login`
2. `gitwal repo create`
3. Git HTTP support for `git push` and `git clone`
4. Local bare repository cache
5. Git bundle or pack artifact upload to Walrus
6. Sui `Repo`, `PackManifest`, and `RefUpdated`
7. Minimal web UI:
   - repo list
   - file tree
   - file viewer
   - commit list
8. Restore cache from Sui manifests and Walrus blobs
9. Basic public repo flow

## Bonus Scope

- Code search from local index
- Private repo with server-gated access and Seal-encrypted Walrus backup
- LFS artifact storage

## Deferred

- Full PR review system
- Full issue tracker
- CI pipeline
- Advanced zero-trust `gitwal://` remote helper
- GitHub import/export
- Organization/team permission model
- On-chain Git DAG verification

## Demo Acceptance

The MVP is successful when:

1. A developer pushes a repo with normal Git.
2. GitWal uploads a durable artifact to Walrus.
3. GitWal writes a Sui manifest for the pushed ref.
4. The local bare repo cache is deleted.
5. GitWal restores the repo from Sui + Walrus.
6. `git clone` works and the commit hash matches the original repo.

