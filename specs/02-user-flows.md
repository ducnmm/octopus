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
octopus repo create my-repo --public
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

## Pull Requests

```bash
octopus pr create ducnmm/my-repo --head feature --title "Add feature"
octopus pr list ducnmm/my-repo --status open
octopus pr view ducnmm/my-repo 1
octopus pr comment ducnmm/my-repo 1 --body "Looks good"
octopus pr merge ducnmm/my-repo 1 --strategy squash --delete-branch
octopus pr close ducnmm/my-repo 1
octopus pr reopen ducnmm/my-repo 1
```

Lifecycle: `open → merged` (terminal) via merge, `open ↔ closed` via close/reopen.
The same operations are available on the web PR pages and the REST API
(`/v1/repos/:owner/:repo/pulls/...`).

Merge flow:

1. Client fetches the PR; the response includes live head/base commits and a
   mergeability (conflict) assessment.
2. Client submits the merge with a strategy (`merge`, `squash`, `fast-forward`)
   and the reviewed `expectedHeadCommit`.
3. Server re-resolves the branches; a moved head or changed base yields 409.
4. Server builds the merged commit with `git merge-tree`/`commit-tree` (no
   working tree) and updates the base ref with a compare-and-swap.
5. Server finalizes the ref change through the same pipeline as a push:
   bundle artifact → Walrus upload → Sui ref manifest. On failure the cache
   refs roll back and the PR stays open.
6. The PR record becomes `merged` with the merge commit, strategy, actor, and
   timestamp; optional head-branch deletion cleans up the cache ref.

Authorization: merge requires repository write access; close, reopen, and
comment are allowed to the PR author or any writer.

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
