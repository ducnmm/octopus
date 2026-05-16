# Domain Model

## On-Chain Objects

```move
OctopusAccount
- owner
- delegate_keys
- repo_count

AccountRegistry
- accounts
- delegate_accounts

RepoRegistry
- repos

Repo
- owner
- name
- visibility
- default_branch
- refs
- members
- seal_policy_id
- next_seq

RefState
- commit_digest
- manifest_id
- seq

PackManifest
- repo_id
- ref_name
- old_commit
- new_commit
- walrus_blob_id
- artifact_digest
- base_manifest_id
- parent_manifest_id
- is_snapshot
- created_by
- created_at_ms
- seq
```

## Events

```text
AccountCreated
DelegateKeyAdded
DelegateKeyRemoved
RepoCreated
RepoMemberAdded
RepoMemberRemoved
RefUpdated
RepoVisibilityChanged
```

## Off-Chain Tables

```text
accounts
delegates
repos
repo_members
refs
pack_manifests
commits
tree_entries
file_index
symbol_index
git_tokens
indexer_state
```

