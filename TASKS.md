# Tasks

## Now

- [x] Choose stack for off-chain apps
- [x] Initialize package manager/workspace
- [x] Scaffold server
- [x] Scaffold CLI
- [x] Scaffold Sui Move package

## MVP Demo

- [x] `octopus auth login`
- [x] `octopus repo connect owner/repo`
- [x] Delegate headers for Git smart HTTP push
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
- [x] Sui testnet adapter scaffold for delegate verification/create_repo/push_ref
- [x] Private repo artifact encryption in local mode
- [x] Postgres schema for testnet metadata tables
- [x] Walrus relay blob attributes and owner transfer
- [x] File browser, file viewer, commit list, and local index surfaces

## Open Questions

- Which Walrus environment should the MVP target?
- Should the first live demo use direct delegate-key transactions or sponsored PTBs?
- Is SSH support required for the first demo, or is HTTPS enough?
- Should the first artifact format be Git bundle or raw pack?
