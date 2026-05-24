# Acceptance: Restore From Walrus And Sui

## Scenario

Given a repo was pushed to Octopus
And the pushed commit is anchored in Sui
And the Git artifact is stored in Walrus
When the local bare repo cache is deleted
And the operator runs:

```bash
ocp repo restore ducnmm/demo
```

Then:

- Octopus reads the repo ref manifests from Sui
- Octopus downloads the required artifacts from Walrus
- Octopus verifies artifact digests
- Octopus rebuilds the local bare repo cache
- `git clone http://127.0.0.1:48787/ducnmm/demo.git restored-demo` succeeds
- the restored repo commit hash equals the original pushed commit hash

The same restore path should also run automatically when a normal `git clone`
or `git fetch` arrives and the local bare repo cache is missing.
