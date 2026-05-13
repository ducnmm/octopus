# Vision

GitWal is not a generic "decentralized GitHub" clone. It is a recoverable Git forge.

## Thesis

Developers keep using normal Git workflows:

```bash
gitwal auth login
gitwal repo create my-repo
git remote add origin https://gitwal.dev/ducnmm/my-repo.git
git push origin main
git clone https://gitwal.dev/ducnmm/my-repo.git
```

GitWal changes the backend durability model:

```text
GitHub/GitLab:
git push -> centralized server/database/storage

GitWal:
git push -> GitWal cache server -> Walrus blob + Sui manifest/proof
```

## Positioning

Tagline:

> GitHub UX. Walrus durability. Sui-anchored repo history.

Core promise:

> We deleted the server cache. The repo came back from Sui + Walrus.

## Principles

- Git CLI compatibility comes first.
- The server can be replaced or rebuilt.
- Walrus stores durable Git artifacts.
- Sui anchors repo identity, ownership, refs, and manifests.
- Postgres and search indexes are disposable caches.
- Move contracts should not verify the Git DAG.

