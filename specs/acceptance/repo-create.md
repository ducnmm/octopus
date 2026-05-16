# Acceptance: Repo Create

## Scenario

Given a user has logged in with `octopus auth login`
When they run:

```bash
octopus repo create demo --public
```

Then:

- the CLI signs the API request with its delegate key
- the server verifies the delegate on Sui
- a repo object is created on Sui
- the repo appears in the web UI
- the repo can be used as a Git remote

Visibility flags:

- `--public` creates a public repo.
- `--private` creates a private repo.
- `--private=false` remains accepted as compatibility syntax for older examples.
