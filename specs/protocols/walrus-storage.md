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

Set `OCTOPUS_WALRUS_MODE=relay` to publish the cached artifact through the
Walrus upload relay. Octopus uses the same write flow as Walrus SDK clients:
encode, register on Sui, upload to the relay, then certify. The server signer
comes from `SERVER_SUI_PRIVATE_KEYS` or `SERVER_SUI_PRIVATE_KEY`; the default
storage window is 50 epochs.

```text
WalrusClient.writeBlobFlow({ blob })
register({ epochs: OCTOPUS_WALRUS_EPOCHS || 50, owner: server_signer })
upload({ digest: register_tx_digest })
certify()
```

Set `OCTOPUS_WALRUS_MODE=cli` to publish the cached artifact through the local
`walrus` binary instead:

```text
walrus store {artifact_path} --json --epochs {OCTOPUS_WALRUS_EPOCHS}
```

The server preserves the local cached bundle even when CLI upload is enabled,
so restore tests can run without re-downloading the blob.

Private artifact encryption defaults to `local-seal` for local development and
existing testnet package compatibility. Production-style private blobs use
`OCTOPUS_SEAL_MODE=seal`, which encrypts with `@mysten/seal` and records a
`seal-v1` envelope containing the repo object key id, threshold, and key-server
metadata. Decryption builds a `registry::seal_approve(id, repo, account)` PTB so
SEAL key servers only release shares when the caller can read the repository.

`SEAL_KEY_SERVERS` configures a comma-separated key-server list. `SEAL_SERVER_CONFIGS`
can be used for weighted or aggregator-backed servers, and `SEAL_THRESHOLD`
controls the threshold.

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
