import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { AuthContext } from "./auth.js";
import { readRepoManifests, type PackManifest } from "./artifacts.js";
import type { ServerConfig } from "./config.js";
import { bareRepoPath, setBareRepositoryHead } from "./git.js";
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
  const repoPath = bareRepoPath(config.repoRoot, owner, repo);
  const repoParent = dirname(repoPath);
  let tempRepoPath: string | null = null;
  let backupRepoPath: string | null = null;
  let restoredCommit = "";

  const bundlePath =
    manifest.encrypted && manifest.sealEnvelope
      ? join(tmpRestoreDir, "snapshot.bundle")
      : artifact.artifactPath;

  try {
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

    await mkdir(repoParent, { recursive: true });
    tempRepoPath = await mkdtemp(join(repoParent, `.${repo}.restore-`));
    await runGit(["clone", "--bare", bundlePath, tempRepoPath]);
    await setBareRepositoryHead(tempRepoPath, manifest.refName);
    await runGit(["--git-dir", tempRepoPath, "config", "http.receivepack", "true"]);
    await runGit(["--git-dir", tempRepoPath, "config", "octopus.owner", owner]);
    await runGit(["--git-dir", tempRepoPath, "config", "octopus.name", repo]);

    restoredCommit = (await runGit(["--git-dir", tempRepoPath, "rev-parse", manifest.refName])).stdout
      .toString("utf8")
      .trim();

    if (restoredCommit !== manifest.newCommit) {
      throw new Error(`Restored ref mismatch: expected ${manifest.newCommit}, got ${restoredCommit}`);
    }

    backupRepoPath = join(repoParent, `.${repo}.backup-${Date.now()}-${process.pid}.git`);
    try {
      await rename(repoPath, backupRepoPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      backupRepoPath = null;
    }

    try {
      await rename(tempRepoPath, repoPath);
      tempRepoPath = null;
      if (backupRepoPath) {
        await rm(backupRepoPath, { recursive: true, force: true });
        backupRepoPath = null;
      }
    } catch (error) {
      if (backupRepoPath) {
        await rm(repoPath, { recursive: true, force: true });
        await rename(backupRepoPath, repoPath);
        backupRepoPath = null;
      }
      throw error;
    }
  } finally {
    await rm(tmpRestoreDir, { recursive: true, force: true });
    if (tempRepoPath) {
      await rm(tempRepoPath, { recursive: true, force: true });
    }
    if (backupRepoPath) {
      await rm(backupRepoPath, { recursive: true, force: true });
    }
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
