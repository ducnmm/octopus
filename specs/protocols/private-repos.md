# Private Repos

Private repo support has two modes.

## MVP Mode: GitHub-Like Private Repo

```text
git push -> server sees plaintext -> server Seal encrypts -> upload to Walrus
```

Properties:

- Normal Git HTTPS/SSH UX
- Web file browser can work
- Code search can work
- Server sees plaintext during push/cache
- Walrus backup is encrypted

Pitch:

> MVP private repos use GitHub-like server-gated access, while Walrus backups are Seal-encrypted.

## Future Mode: Zero-Trust Private Repo

```text
local client -> Seal encrypt Git artifact -> server receives ciphertext -> Walrus
```

Properties:

- Server cannot read private source code
- Requires `gitwal://`, a Git remote helper, or local proxy
- Web private repo browsing must decrypt client-side

