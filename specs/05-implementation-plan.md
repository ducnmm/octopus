# Implementation Plan

## Phase 0: Skeleton

- [x] Create SDD folder structure
- [x] Add vision, scope, architecture, protocols, acceptance specs
- [x] Choose implementation stack
- [x] Create dev scripts

## Phase 1: Local Git Gateway

Goal: prove normal Git can push/clone through the server.

- [x] Implement minimal server app
- [x] Serve Git HTTP endpoints
- [x] Store repos as local bare repo cache
- [x] Support `git push`
- [x] Support `git clone`
- [x] Add local e2e test for push/clone

Relevant specs:

- `protocols/git-http.md`
- `acceptance/push-and-anchor.md`

## Phase 2: Walrus Artifact Path

Goal: every push produces a durable artifact.

- [x] Create bundle/pack artifact after push
- [x] Compute artifact digest
- [x] Upload artifact to Walrus through CLI mode
- [x] Store local dev fallback for Walrus if needed
- [x] Record artifact metadata

Relevant specs:

- `protocols/walrus-storage.md`
- `acceptance/push-and-anchor.md`

## Phase 3: Sui Registry Path

Goal: every pushed ref is anchored on Sui.

- [x] Implement Move package
- [x] Add account and delegate key objects
- [x] Add repo and ref state objects
- [x] Add `push_ref`
- [x] Emit `RefUpdated`
- [ ] Wire server to submit ref update transaction
- [x] Wire server to local Sui-shaped registry mirror

Relevant specs:

- `protocols/sui-registry.md`
- `04-domain-model.md`

## Phase 4: Restore Demo

Goal: delete cache and recover repo.

- [x] Query local Sui-shaped manifests
- [x] Download Walrus artifacts through Aggregator or CLI
- [x] Verify artifact digest from local Walrus fallback
- [x] Rebuild bare repo cache from snapshot bundle
- [ ] Reindex metadata
- [x] Prove clone works after local fallback restore

Relevant specs:

- `protocols/restore-flow.md`
- `acceptance/restore-from-walrus-sui.md`

## Phase 5: Product Surface

Goal: make the demo understandable.

- [ ] Minimal CLI commands
- [ ] Minimal web UI repo list
- [ ] File tree
- [ ] File viewer
- [ ] Commit list
- [ ] Demo script
