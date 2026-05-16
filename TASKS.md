# Tasks

## Now

- [x] Choose stack for off-chain apps
- [x] Initialize package manager/workspace
- [x] Scaffold server
- [x] Scaffold CLI
- [x] Scaffold Sui Move package

## MVP Demo

- [ ] `octopus auth login`
- [x] `octopus repo create demo` local bare repo path
- [x] Git push to local server
- [x] Create local Git bundle artifact for push
- [x] Upload artifact to Walrus via CLI mode
- [x] Write Sui ref manifest in local registry mode
- [x] Delete cache in local restore test
- [x] Restore from local Walrus fallback manifest
- [x] Download Walrus blob via Aggregator for restore
- [x] Clone restored repo
- [x] Restore from local Sui registry + Walrus fallback

## Open Questions

- Which Walrus environment should the MVP target?
- Should demo use Sui testnet or localnet first?
- Should the server submit Sui transactions directly or sponsor delegate-key transactions?
- Is SSH support required for the first demo, or is HTTPS enough?
- Should the first artifact format be Git bundle or raw pack?
