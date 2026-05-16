# Acceptance: Auth Login

## Scenario

Given a user has a Sui wallet
When they run:

```bash
octopus auth login
```

Then:

- a local delegate key is generated
- the browser opens the Octopus login page
- the user approves the delegate key with their wallet
- the delegate key is registered on Sui
- credentials are written to `~/.octopus/credentials.json`

