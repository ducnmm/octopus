# Sui Registry Protocol

Sui anchors repo identity, account ownership, permissions, ref state, and artifact manifests.

The current server implementation has a local registry adapter that writes the
same repo/ref/manifest shape to `data/sui/repos` during development. Live Sui
transaction submission will replace that adapter once the package is published.

## Entry Functions

```move
create_account()
add_delegate_key()
remove_delegate_key()

create_repo()
add_member()
remove_member()
set_visibility()
push_ref()
set_default_branch()
```

## `push_ref`

`push_ref` should be small and strict:

1. Caller must be owner or writer.
2. Delegate must be authorized.
3. `expected_old_commit` must match the current ref.
4. New `PackManifest` is created.
5. `RefState` is updated.
6. `RefUpdated` is emitted.

Git validity stays off-chain:

- `git fsck`
- fast-forward checks
- old commit reachability
- branch protection
- file size limits

## MVP Contract Shape

- `octopus::account::AccountRegistry`
- `octopus::account::OctopusAccount`
- `octopus::registry::RepoRegistry`
- `octopus::registry::Repo`
- `octopus::registry::RefState`
- `octopus::registry::PackManifest`

For first-push refs, the empty string represents no previous commit. Off-chain
Git validation remains responsible for mapping that to `null` in HTTP/API
responses.
