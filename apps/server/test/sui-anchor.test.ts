import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { localManifestId, readRepoManifests, type PackManifest } from "../src/artifacts.js";
import type { ServerConfig } from "../src/config.js";
import { anchorPushManifests, ensureSuiRepo, readSuiRepoState } from "../src/sui.js";

let workspace: string;
let config: ServerConfig;

const owner = "0x1234";
const repo = "demo";
const refName = "refs/heads/main";
const artifactDigest = "a".repeat(64);

const manifest = (overrides: Partial<PackManifest> = {}): PackManifest => ({
  manifestId: localManifestId(overrides.seq ?? 1, overrides.refName ?? refName, overrides.artifactDigest ?? artifactDigest),
  repoId: `${owner}/${repo}`,
  owner,
  repo,
  refName,
  oldCommit: null,
  newCommit: "commit-new",
  walrusBlobId: `local:${artifactDigest}`,
  artifactDigest,
  artifactSizeBytes: 12,
  artifactPath: join(workspace, "artifact.bundle"),
  storageMode: "local",
  visibility: "public",
  encrypted: false,
  walrusMetadata: {},
  isSnapshot: true,
  createdAtMs: Date.now(),
  seq: 1,
  ...overrides
});

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "octopus-sui-anchor-"));
  config = {
    host: "127.0.0.1",
    port: 0,
    dataDir: join(workspace, "data"),
    repoRoot: join(workspace, "data", "repos"),
    webUrl: "http://127.0.0.1:45173",
    suiMode: "local",
    suiNetwork: "localnet",
    suiRpcUrl: "http://127.0.0.1:9000",
    walrusNetwork: "testnet",
    serverSuiPrivateKeys: [],
    sealMode: "local",
    sealKeyServers: [],
    webSessionSecret: "test-secret",
    delegateCacheTtlMs: 60_000
  };
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

test("anchors a snapshot as initial ref when registry missed an earlier git ref update", async () => {
  const pushedManifest = manifest({
    oldCommit: "commit-that-only-exists-in-git",
    newCommit: "commit-current",
    seq: 2,
    manifestId: localManifestId(2, refName, artifactDigest)
  });

  await anchorPushManifests(config, [pushedManifest]);

  const state = await readSuiRepoState(config, owner, repo);
  expect(state?.refs[refName]?.commitDigest).toBe("commit-current");
  expect(state?.manifests).toHaveLength(1);
  expect(state?.manifests[0]).toMatchObject({
    oldCommit: null,
    newCommit: "commit-current",
    seq: 1,
    manifestId: localManifestId(1, refName, artifactDigest)
  });

  const localManifests = await readRepoManifests(config.dataDir, owner, repo);
  expect(localManifests).toHaveLength(1);
  expect(localManifests[0]).toMatchObject({
    oldCommit: null,
    newCommit: "commit-current",
    seq: 1,
    manifestId: localManifestId(1, refName, artifactDigest)
  });
});

test("still rejects non-recoverable ref mismatches", async () => {
  await ensureSuiRepo(config, { owner, repo, visibility: "public" });
  await anchorPushManifests(config, [manifest({ oldCommit: null, newCommit: "commit-a" })]);

  await expect(
    anchorPushManifests(config, [
      manifest({
        oldCommit: "different-old-commit",
        newCommit: "commit-b",
        artifactDigest: "b".repeat(64),
        manifestId: localManifestId(2, refName, "b".repeat(64)),
        seq: 2
      })
    ])
  ).rejects.toThrow("Sui ref mismatch");
});
