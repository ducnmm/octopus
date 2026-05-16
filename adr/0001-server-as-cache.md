# ADR 0001: Server As Cache

## Status

Accepted

## Context

Git hosting needs a fast server for Git protocol compatibility, web UI, search, and indexing. But Octopus's core claim is recoverability from decentralized storage and on-chain manifests.

## Decision

The Octopus server is a gateway and cache, not the source of truth.

Durable state lives in:

- Walrus for Git artifacts
- Sui for repo identity, permissions, refs, and manifests

Disposable state lives in:

- local bare repo cache
- Postgres
- search index
- derived web UI metadata

## Consequences

- Restore flow is a first-class feature.
- Indexers must be replayable.
- Push flow must write Walrus and Sui state before claiming durable success.
- MVP is replaceable/recoverable, but not fully trustless because the server still handles Git protocol and may see plaintext private repos.

