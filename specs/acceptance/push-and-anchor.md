# Acceptance: Push And Anchor

## Scenario

Given a public repo exists
And a user has write permission
When they run:

```bash
git remote add origin https://localhost:8787/ducnmm/demo.git
git push origin main
```

Then:

- the server authenticates the Git credential
- the server updates the local bare repo cache
- the server validates the repo with Git tooling
- the server uploads a Git artifact to Walrus
- the server writes a Sui `PackManifest`
- the Sui ref state points to the pushed commit

