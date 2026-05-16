# Walrus Storage Protocol

Walrus stores durable Git artifacts. Octopus should store coarse artifacts instead of individual files or Git objects.

## Store

Good artifact types:

- incremental Git bundle per push
- periodic full snapshot bundle
- pack artifacts
- LFS objects
- release artifacts
- CI logs
- PR/issue archive
- SBOM/provenance

Avoid:

- one Walrus blob per file
- one Walrus blob per Git object

## Local Development Fallback

Before real Walrus upload is wired, the server stores pushed artifacts under:

```text
data/walrus/blobs/{artifact_digest}.bundle
```

The fallback blob id format is:

```text
local:{artifact_digest}
```

This keeps the server/Walrus boundary explicit while letting the Git gateway
produce the same manifest shape that the real Walrus path will use.

Set `OCTOPUS_WALRUS_MODE=cli` to also publish the cached artifact through the
local `walrus` binary:

```text
walrus store {artifact_path} --json --epochs {OCTOPUS_WALRUS_EPOCHS}
```

The server preserves the local cached bundle even when CLI upload is enabled,
so restore tests can run without re-downloading the blob.

For restore from a non-local blob id, the server prefers the Walrus Aggregator
when `WALRUS_AGGREGATOR_URL` is configured:

```text
GET {WALRUS_AGGREGATOR_URL}/v1/blobs/{walrus_blob_id}
```

If no aggregator URL is configured, restore falls back to:

```text
walrus read {walrus_blob_id} --out {artifact_path}
```

## Manifest Fields

Each pushed artifact should produce a manifest containing:

```text
repo_id
ref_name
old_commit
new_commit
walrus_blob_id
artifact_digest
base_manifest_id
parent_manifest_id
is_snapshot
seq
created_by
created_at_ms
```

## Restore Strategy

Restore should start from the latest full snapshot, then apply later incremental manifests in sequence.
