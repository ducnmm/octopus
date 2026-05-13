# ADR 0003: Move Only Anchors Refs

## Status

Accepted

## Context

Git DAG validation is complex and better handled by Git tooling. Sui Move should keep the canonical registry small and auditable.

## Decision

Move contracts anchor:

- account identity
- delegate keys
- repo identity
- permissions
- ref state
- artifact manifests

Move contracts do not verify Git DAG validity.

## Consequences

- `push_ref` checks authorization and expected old commit.
- Server validates Git data with `git fsck` and policy checks.
- The on-chain state remains compact.

