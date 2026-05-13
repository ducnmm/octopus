# Architecture

```text
Git CLI / Web UI / GitWal CLI
      |
      v
GitWal Server
  - Git HTTP/SSH gateway
  - local bare repo cache
  - API
  - web UI backend
  - search/index cache
      |
      +--> Walrus: Git bundles, packfiles, LFS, releases, logs
      |
      +--> Sui: repo registry, account registry, ref update manifests
      |
      +--> Postgres/search: disposable cache and indexed metadata
```

## Source Of Truth

Sui stores:

- repo identity
- owner/member roles
- branch/tag current commit
- manifest id per ref update
- Walrus blob id and artifact digest

Walrus stores:

- Git bundles or pack artifacts
- LFS objects
- release artifacts
- CI logs
- PR/issue/comment archive
- encrypted private repo backups

## Disposable State

The following can be rebuilt:

- local bare repo cache
- Postgres metadata
- file index
- code search index
- web UI derived views

## Server Responsibilities

- receive `git push`
- validate Git data
- update local bare repo cache
- create artifact manifest
- upload artifact to Walrus
- submit Sui transaction for ref update
- index files, commits, tree data, and README
- restore cache from Walrus when local cache is missing

