# ADR 0002: Store Git Bundles Instead Of Files

## Status

Accepted

## Context

Walrus is durable blob storage. Git repositories contain many small objects and files.

## Decision

GitWal stores coarse Git artifacts in Walrus:

- incremental bundle or pack per push
- periodic full snapshot bundle
- LFS and release artifacts separately

GitWal does not store one Walrus blob per file or one Walrus blob per Git object.

## Consequences

- Restore has fewer blobs to fetch.
- Walrus metadata overhead stays lower.
- File browsing and search depend on local indexing.
- Manifests need snapshot/incremental chain metadata.

