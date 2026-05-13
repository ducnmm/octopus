# Walrus Storage Protocol

Walrus stores durable Git artifacts. GitWal should store coarse artifacts instead of individual files or Git objects.

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

