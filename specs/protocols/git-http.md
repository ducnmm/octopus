# Git HTTP Protocol

Octopus should support normal Git HTTPS remotes:

```bash
git remote add origin https://octopus.dev/owner/repo.git
git push origin main
git clone https://octopus.dev/owner/repo.git
```

## Push Requirements

On push, the server must:

1. Authenticate the Git credential.
2. Resolve credential to a Sui account/delegate.
3. Check write permission.
4. Receive the pack into the bare repo cache.
5. Validate the result with Git tooling.
6. Reject invalid or unauthorized ref updates.
7. Create and upload a Walrus artifact.
8. Anchor the new ref state on Sui.

Ref deletion is supported in local registry mode. In Sui testnet mode, branch
or tag deletion must be rejected before anchoring until the live registry exposes
a delete-ref transaction.

## Clone/Fetch Requirements

On clone/fetch, the server should serve from local bare repo cache when available.

If cache is missing, it must restore from Sui manifests and Walrus artifacts before serving.

For private repositories, clone/fetch uses the same Git HTTPS credential helper
token established by `ocp auth login`.
