---
title: CLI Reference
description: Commands and common flows for the octopus developer CLI.
---

# CLI Reference

The `octopus` CLI is published as `@ducnmm/octopus` and is also available from
the monorepo through `pnpm octopus`.

## Defaults

Without flags, the CLI targets the hosted testnet services:

```text
Server: https://octopus-server.up.railway.app
Web:    https://octopus-app.up.railway.app
```

Use local development URLs with `--dev`:

```text
Server: http://127.0.0.1:48787
Web:    http://127.0.0.1:45173
```

You can also set `OCTOPUS_SERVER_URL`, `OCTOPUS_HOST`, `OCTOPUS_PORT`, or
`OCTOPUS_WEB_URL`.

## Install

```bash
npm install -g @ducnmm/octopus
```

From this repository:

```bash
pnpm octopus --help
```

## Authentication

### `octopus auth login`

Starts wallet-backed CLI login. The CLI generates or reuses a delegate key,
opens the wallet approval page, and stores credentials locally.

```bash
octopus auth login
octopus auth login --dev
octopus auth login --server http://127.0.0.1:48787 --web-url http://127.0.0.1:45173
octopus auth login --no-browser
```

Options:

| Option | Purpose |
|---|---|
| `--server <url>` | Target Octopus server. |
| `-d, --dev` | Use local server and local web login defaults. |
| `--web-url <url>` | Wallet login app URL. |
| `--callback-port <port>` | Local callback port. `0` picks a free port. |
| `--timeout-ms <ms>` | Wallet approval timeout. |
| `--delegate-private-key <key>` | Reuse an existing delegate private key. |
| `--package-id <id>` | Sui package ID override. |
| `--account-registry-id <id>` | Account registry object ID override. |
| `--repo-registry-id <id>` | Repo registry object ID override. |
| `--no-browser` | Print the login URL without opening a browser. |

### `octopus auth whoami`

Prints saved wallet, account, delegate, and server.

```bash
octopus auth whoami
```

### `octopus auth logout`

Deletes local Octopus credentials.

```bash
octopus auth logout
```

## Repository Commands

### `octopus repo create <name>`

Creates a repository and returns its Git remote path.

```bash
octopus repo create demo --public
octopus repo create demo --private
octopus repo create demo --owner my-name.sui
octopus repo create demo --dev
```

Options:

| Option | Purpose |
|---|---|
| `--owner <owner>` | Repository owner namespace. Defaults to SuiNS or wallet address. |
| `--public` | Create a public repository. |
| `--private [value]` | Create a private repository. Use `--private=false` for compatibility. |
| `--server <url>` | Target Octopus server. |
| `-d, --dev` | Use local server default. |

### `octopus repo connect <owner/name>`

Configures a Git remote and repo-local `http.extraHeader` values for delegate
auth.

```bash
octopus repo connect <owner>/demo
octopus repo connect <owner>/demo --remote upstream
octopus repo connect <owner>/demo --dev
```

After connecting:

```bash
git push origin main
git clone http://127.0.0.1:48787/<owner>/demo.git
```

### `octopus repo manifests <owner/name>`

Lists artifact manifests known to the server.

```bash
octopus repo manifests <owner>/demo
octopus repo manifests <owner>/demo --dev
```

### `octopus repo restore <owner/name>`

Restores the server's local bare repo cache from the latest stored snapshot
manifest.

```bash
octopus repo restore <owner>/demo
octopus repo restore <owner>/demo --dev
```

The top-level alias also works:

```bash
octopus restore <owner>/demo
```

## Pull Request Commands

### `octopus pr create <owner/name>`

Creates an Octopus pull request between two refs.

```bash
octopus pr create <owner>/demo --head feature-branch --title "Add feature"
octopus pr create <owner>/demo --base main --head feature-branch --title "Add feature" --body "Details"
```

Options:

| Option | Purpose |
|---|---|
| `--head <ref>` | Source branch. Required. |
| `--title <title>` | Pull request title. Required. |
| `--base <ref>` | Target branch. Defaults to the repository default branch. |
| `--body <body>` | Pull request description. |
| `--server <url>` | Target Octopus server. |
| `-d, --dev` | Use local server default. |

## Common Flows

Create and push:

```bash
octopus auth login
octopus repo create demo --public
octopus repo connect <owner>/demo
git push origin main
```

Local development:

```bash
pnpm dev:server
pnpm dev:web
pnpm octopus auth login --dev
pnpm octopus repo create demo --public --dev
pnpm octopus repo connect <owner>/demo --dev
git push origin main
```

Restore after cache loss:

```bash
rm -rf ./data/repos/<owner>/demo.git
octopus repo restore <owner>/demo
git clone <server>/<owner>/demo.git restored-demo
```
