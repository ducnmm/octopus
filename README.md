# GitWal

GitWal is a recoverable Git forge: GitHub-like developer UX, Walrus-backed repository durability, and Sui-anchored ref history.

The server is a Git gateway, cache, indexer, and search node. The source of truth is stored in Walrus blobs and Sui registry objects.

## Spec-Driven Development

This repo is initialized spec-first. Before implementing a feature, define or update:

1. The user flow in `specs/02-user-flows.md`.
2. The protocol contract in `specs/protocols/`.
3. The acceptance behavior in `specs/acceptance/`.
4. Any architecture decision in `adr/`.

Code should trace back to a spec or ADR.

## Core Demo

```bash
gitwal auth login
gitwal repo create demo
git remote add origin https://localhost:8787/ducnmm/demo.git
git push origin main

rm -rf ./data/repos/ducnmm/demo.git

gitwal repo restore ducnmm/demo
git clone https://localhost:8787/ducnmm/demo.git restored-demo
```

Expected result: the restored clone has the same Git commit hash as the original repository.

