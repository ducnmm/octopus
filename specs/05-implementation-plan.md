# Implementation Plan

## Phase 0: Skeleton

- [x] Create SDD folder structure
- [x] Add vision, scope, architecture, protocols, acceptance specs
- [ ] Choose implementation stack
- [ ] Create dev scripts

## Phase 1: Local Git Gateway

Goal: prove normal Git can push/clone through the server.

- [ ] Implement minimal server app
- [ ] Serve Git HTTP endpoints
- [ ] Store repos as local bare repo cache
- [ ] Support `git push`
- [ ] Support `git clone`
- [ ] Add local e2e test for push/clone

Relevant specs:

- `protocols/git-http.md`
- `acceptance/push-and-anchor.md`

## Phase 2: Walrus Artifact Path

Goal: every push produces a durable artifact.

- [ ] Create bundle/pack artifact after push
- [ ] Compute artifact digest
- [ ] Upload artifact to Walrus
- [ ] Store local dev fallback for Walrus if needed
- [ ] Record artifact metadata

Relevant specs:

- `protocols/walrus-storage.md`
- `acceptance/push-and-anchor.md`

## Phase 3: Sui Registry Path

Goal: every pushed ref is anchored on Sui.

- [ ] Implement Move package
- [ ] Add account and delegate key objects
- [ ] Add repo and ref state objects
- [ ] Add `push_ref`
- [ ] Emit `RefUpdated`
- [ ] Wire server to submit ref update transaction

Relevant specs:

- `protocols/sui-registry.md`
- `04-domain-model.md`

## Phase 4: Restore Demo

Goal: delete cache and recover repo.

- [ ] Query Sui manifests
- [ ] Download Walrus artifacts
- [ ] Verify artifact digest
- [ ] Rebuild bare repo cache
- [ ] Reindex metadata
- [ ] Prove clone works after restore

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

