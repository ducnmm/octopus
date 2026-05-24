# Auth Protocol

## Login

Command:

```bash
ocp auth login
```

The CLI generates a local delegate key and asks the user to approve it through a Sui wallet. In testnet mode, the wallet creates an `OctopusAccount` if needed and registers both the CLI delegate key and the configured server relay delegate key on-chain.

## Delegate Git/API Auth

REST API requests use:

```text
x-octopus-auth-token
```

Git HTTPS requests use standard Basic auth by default. The username is
`octopus`; the password is the signed delegate auth token with `scope=git`.
Servers also continue to accept `x-octopus-auth-token` on Git requests for
repo-local `http.extraHeader` compatibility.

Server verification:

1. Decode the signed delegate auth token.
2. Verify the Ed25519 personal-message signature against the delegate public key.
3. Check the delegate key is registered locally or on-chain for the token account ID.
4. Map delegate key to wallet/account.
5. Authorize requested repo action.

## Git Compatibility

Normal Git HTTPS cannot sign Sui wallet messages on every push. `ocp auth login`
stores a Git credential containing a signed delegate token, so normal `git push`
and private `git clone` can use the Git credential helper. The delegate private
key stays on the client machine.
