import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { AuthContext } from "./auth.js";
import { readRepoManifests, type PackManifest } from "./artifacts.js";
import type { ServerConfig } from "./config.js";
import { bareRepoPath } from "./git.js";
import { decryptArtifactForRepo } from "./seal.js";
import { readSuiRepoManifestsWithSource } from "./sui.js";
import { readArtifact } from "./walrus.js";

type GitResult = {
  stdout: Buffer;
  stderr: Buffer;
};

export type RestoreResult = {
  owner: string;
  repo: string;
  repoPath: string;
  manifestId: string;
  refName: string;
  restoredCommit: string;
  artifactDigest: string;
  artifactPath: string;
  storageMode: "local" | "walrus-cli" | "walrus-aggregator";
  manifestSource: "sui-local" | "sui-testnet" | "artifact-fallback";
};

const runGit = async (args: string[]): Promise<GitResult> => {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn("git", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const result = {
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr)
      };

      if (code === 0) {
        resolvePromise(result);
        return;
      }

      reject(new Error(`git ${args.join(" ")} failed: ${result.stderr.toString()}`));
    });
  });
};

const sha256File = async (filePath: string): Promise<string> => {
  const hash = createHash("sha256");
  hash.update(await readFile(filePath));
  return hash.digest("hex");
};

const latestSnapshotManifest = (manifests: PackManifest[]): PackManifest | null => {
  const snapshots = manifests.filter((manifest) => manifest.isSnapshot);
  if (snapshots.length === 0) {
    return null;
  }

  return snapshots.sort((a, b) => b.seq - a.seq || b.createdAtMs - a.createdAtMs)[0] ?? null;
};

const assertFileExists = async (filePath: string): Promise<void> => {
  try {
    await access(filePath);
  } catch {
    throw new Error(`Artifact not found: ${filePath}`);
  }
};

export const restoreRepository = async (
  config: ServerConfig,
  owner: string,
  repo: string,
  auth?: AuthContext | null
): Promise<RestoreResult> => {
  const suiManifestResult = await readSuiRepoManifestsWithSource(config, owner, repo);
  const suiManifests = suiManifestResult.manifests;
  const manifests =
    suiManifests.length > 0 ? suiManifests : await readRepoManifests(config.dataDir, owner, repo);
  const manifestSource = suiManifests.length > 0 ? suiManifestResult.source : "artifact-fallback";
  const manifest = latestSnapshotManifest(manifests);
  if (!manifest) {
    throw new Error(`No snapshot manifest found for ${owner}/${repo}`);
  }

  if (manifest.visibility === "private" && !auth) {
    throw new Error(`Authentication is required to restore ${owner}/${repo}`);
  }

  const artifact = await readArtifact({
    dataDir: config.dataDir,
    blobId: manifest.walrusBlobId,
    artifactDigest: manifest.storedArtifactDigest ?? manifest.artifactDigest,
    preferredPath: manifest.artifactPath,
    walrusAggregatorUrl: config.walrusAggregatorUrl
  });

  await assertFileExists(artifact.artifactPath);
  const storedDigest = await sha256File(artifact.artifactPath);
  const expectedStoredDigest = manifest.storedArtifactDigest ?? manifest.artifactDigest;
  if (storedDigest !== expectedStoredDigest) {
    throw new Error(`Artifact digest mismatch: expected ${expectedStoredDigest}, got ${storedDigest}`);
  }

  const tmpRestoreDir = await mkdtemp(join(tmpdir(), "octopus-restore-"));
  const bundlePath =
    manifest.encrypted && manifest.sealEnvelope
      ? join(tmpRestoreDir, "snapshot.bundle")
      : artifact.artifactPath;
  if (manifest.encrypted && manifest.sealEnvelope) {
    await decryptArtifactForRepo({
      sourcePath: artifact.artifactPath,
      outputPath: bundlePath,
      repoId: manifest.repoId,
      envelope: manifest.sealEnvelope,
      accountId: auth?.accountId,
      serverSuiPrivateKey: config.serverSuiPrivateKeys[0],
      suiRpcUrl: config.suiRpcUrl,
      suiNetwork: config.suiNetwork,
      sealServerConfigs: config.sealServerConfigs,
      sealKeyServers: config.sealKeyServers,
      sealThreshold: config.sealThreshold
    });
    const plaintextDigest = await sha256File(bundlePath);
    if (plaintextDigest !== manifest.artifactDigest) {
      throw new Error(`Decrypted artifact digest mismatch: expected ${manifest.artifactDigest}, got ${plaintextDigest}`);
    }
  }

  const repoPath = bareRepoPath(config.repoRoot, owner, repo);
  try {
    await rm(repoPath, { recursive: true, force: true });
    await mkdir(dirname(repoPath), { recursive: true });
    await runGit(["clone", "--bare", bundlePath, repoPath]);
    await runGit(["--git-dir", repoPath, "config", "http.receivepack", "true"]);
    await runGit(["--git-dir", repoPath, "config", "octopus.owner", owner]);
    await runGit(["--git-dir", repoPath, "config", "octopus.name", repo]);
  } finally {
    await rm(tmpRestoreDir, { recursive: true, force: true });
  }

  const restoredCommit = (await runGit(["--git-dir", repoPath, "rev-parse", manifest.refName])).stdout
    .toString("utf8")
    .trim();

  if (restoredCommit !== manifest.newCommit) {
    throw new Error(`Restored ref mismatch: expected ${manifest.newCommit}, got ${restoredCommit}`);
  }

  return {
    owner,
    repo,
    repoPath,
    manifestId: manifest.manifestId,
    refName: manifest.refName,
    restoredCommit,
    artifactDigest: manifest.artifactDigest,
    artifactPath: artifact.artifactPath,
    storageMode: artifact.storageMode,
    manifestSource
  };
};
