# Acceptance: Restore From Walrus And Sui

## Scenario

Given a repo was pushed to Octopus
And the pushed commit is anchored in Sui
And the Git artifact is stored in Walrus
When the local bare repo cache is deleted
And the operator runs:

```bash
octopus repo restore ducnmm/demo
```

Then:

- Octopus reads the repo ref manifests from Sui
- Octopus downloads the required artifacts from Walrus
- Octopus verifies artifact digests
- Octopus rebuilds the local bare repo cache
- `git clone https://localhost:8787/ducnmm/demo.git restored-demo` succeeds
- the restored repo commit hash equals the original pushed commit hash

