# Auth Protocol

## Login

Command:

```bash
gitwal auth login
```

The CLI generates a local delegate key and asks the user to approve it through a Sui wallet.

## Delegate API Signature

Headers:

```text
x-delegate-public-key
x-delegate-signature
x-delegate-timestamp
```

Message:

```text
timestamp.method.path.sha256(body)
```

Server verification:

1. Verify signature with `x-delegate-public-key`.
2. Check timestamp freshness.
3. Check delegate key is registered on-chain.
4. Map delegate key to wallet/account.
5. Authorize requested repo action.

## Git Compatibility

Normal Git HTTPS cannot sign Sui wallet messages on every push. GitWal uses Git tokens or SSH keys for Git protocol compatibility, then maps those credentials back to Sui-owned accounts.

