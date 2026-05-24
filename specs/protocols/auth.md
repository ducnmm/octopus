# Auth Protocol

## Login

Command:

```bash
ocp auth login
```

The CLI generates a local delegate key and asks the user to approve it through a Sui wallet. In testnet mode, the wallet creates an `OctopusAccount` if needed and registers both the CLI delegate key and the configured server relay delegate key on-chain.

## Delegate Git/API Headers

Headers:

```text
x-octopus-auth-token
```

Server verification:

1. Decode the signed delegate auth token.
2. Verify the Ed25519 personal-message signature against the delegate public key.
3. Check the delegate key is registered locally or on-chain for the token account ID.
4. Map delegate key to wallet/account.
5. Authorize requested repo action.

## Git Compatibility

Normal Git HTTPS cannot sign Sui wallet messages on every push. Octopus writes a repo-local Git `http.extraHeader` containing a signed delegate token, so the delegate private key stays on the client machine.
