# Restore Flow

Restore proves GitWal's core thesis: the server cache is rebuildable.

## Inputs

- owner
- repo name
- target ref
- Sui repo object
- Sui ref manifests
- Walrus artifacts

## Flow

1. Query Sui for the repo and target ref.
2. Resolve the latest ref manifest.
3. Find the latest usable full snapshot manifest.
4. Download snapshot artifact from Walrus.
5. Verify artifact digest.
6. Rebuild bare repo cache.
7. Apply incremental artifacts after the snapshot.
8. Verify final ref commit equals Sui `RefState`.
9. Reindex files and commits.
10. Serve `git clone` or `git fetch`.

## Failure Cases

- Missing Walrus blob
- Digest mismatch
- Sui manifest sequence gap
- Final commit mismatch
- Unauthorized private repo access

