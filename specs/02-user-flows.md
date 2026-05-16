# User Flows

## Login

```bash
octopus auth login
```

Flow:

1. CLI generates a local Ed25519 delegate key.
2. CLI starts a localhost callback server.
3. CLI opens the browser at `https://octopus.dev/login?port=...&pubkey=...&address=...`.
4. User connects a Sui wallet.
5. Web app creates `OctopusAccount` if needed.
6. Web app calls Move `add_delegate_key`.
7. Browser redirects to the CLI callback.
8. CLI stores credentials in `~/.octopus/credentials.json`.

Auth model:

```text
Wallet = root identity
Delegate key = CLI/server API auth key
Git token/credential = Git HTTPS compatibility
```

## Create Repo

```bash
octopus repo create my-repo --private=false
```

The CLI calls the server API with a delegate signature. The server verifies the delegate key against Sui, then creates the repo object.

## Push

```bash
git remote add origin https://octopus.dev/ducnmm/my-repo.git
git push origin main
```

Flow:

1. Git client pushes over HTTPS to the Octopus server.
2. Server authenticates with Git token or SSH key.
3. Server receives the Git pack into a local bare repo cache.
4. Server validates repository data with Git tooling.
5. Server creates a durable Git artifact.
6. Server uploads the artifact to Walrus.
7. Server submits a Sui transaction to update the ref and write the manifest.
8. Server indexes metadata for web UI and search.

## Clone

```bash
git clone https://octopus.dev/ducnmm/my-repo.git
```

Normal path: the server serves from local bare repo cache.

Restore path:

1. Server queries Sui ref manifests.
2. Server downloads Walrus artifacts.
3. Server verifies artifact digests.
4. Server rebuilds the bare repo cache.
5. Server serves clone/fetch.

