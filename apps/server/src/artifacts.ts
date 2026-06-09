import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { encryptArtifactForRepo, type SealEnvelope } from "./seal.js";
import { storeArtifact, type WalrusBlobMetadata } from "./walrus.js";

export type GitRefMap = Map<string, string>;

export type PackManifest = {
  manifestId: string;
  repoId: string;
  owner: string;
  repo: string;
  actorWalletAddress?: string;
  refName: string;
  oldCommit: string | null;
  newCommit: string;
  walrusBlobId: string;
  walrusBlobObjectId?: string;
  artifactDigest: string;
  storedArtifactDigest?: string;
  artifactSizeBytes: number;
  artifactPath: string;
  storageMode: "local" | "walrus-cli" | "walrus-relay";
  walrusBlobOwnerAddress?: string;
  walrusOwnershipTransferred?: boolean;
  visibility: "public" | "private";
  encrypted: boolean;
  sealEnvelope?: SealEnvelope;
  walrusMetadata: WalrusBlobMetadata;
  isSnapshot: boolean;
  createdAtMs: number;
  seq: number;
};

type GitResult = {
  stdout: Buffer;
  stderr: Buffer;
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

export const listRefs = async (repoPath: string): Promise<GitRefMap> => {
  const result = await runGit(["--git-dir", repoPath, "for-each-ref", "--format=%(refname) %(objectname)"]);
  const refs: GitRefMap = new Map();

  for (const line of result.stdout.toString("utf8").split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const separator = line.indexOf(" ");
    if (separator < 0) {
      continue;
    }

    refs.set(line.slice(0, separator), line.slice(separator + 1));
  }

  return refs;
};

const sha256File = async (filePath: string): Promise<string> => {
  const hash = createHash("sha256");
  const file = await readFile(filePath);
  hash.update(file);
  return hash.digest("hex");
};

const nextManifestSequence = async (manifestDir: string): Promise<number> => {
  try {
    const files = await readdir(manifestDir);
    const maxSeq = files.reduce((max, file) => {
      const match = file.match(/^(\d+)-/);
      if (!match) {
        return max;
      }

      return Math.max(max, Number.parseInt(match[1] ?? "0", 10));
    }, 0);

    return maxSeq + 1;
  } catch {
    return 1;
  }
};

const refSlug = (refName: string): string => {
  return refName.replace(/^refs\//, "").replace(/[^A-Za-z0-9._-]+/g, "-");
};

const isDurableRef = (refName: string): boolean => {
  return refName.startsWith("refs/heads/") || refName.startsWith("refs/tags/");
};

const changedRefs = (
  before: GitRefMap,
  after: GitRefMap
): Array<{
  refName: string;
  oldCommit: string | null;
  newCommit: string;
}> => {
  const changed: Array<{
    refName: string;
    oldCommit: string | null;
    newCommit: string;
  }> = [];

  for (const [refName, newCommit] of after.entries()) {
    if (!isDurableRef(refName)) {
      continue;
    }

    const oldCommit = before.get(refName) ?? null;
    if (oldCommit !== newCommit) {
      changed.push({ refName, oldCommit, newCommit });
    }
  }

  return changed;
};

const durableWalrusMode = (): boolean => {
  const mode = process.env.OCTOPUS_WALRUS_MODE;
  return mode === "cli" || mode === "relay" || mode === "walrus-relay" || mode === "upload-relay";
};

export const createPushArtifacts = async (input: {
  dataDir: string;
  repoPath: string;
  owner: string;
  repo: string;
  beforeRefs: GitRefMap;
  afterRefs: GitRefMap;
  visibility?: "public" | "private";
  repoObjectId?: string;
  packageId?: string;
  accountId?: string;
  sealMode?: "local" | "seal";
  walrusNetwork?: string;
  walrusUploadRelayUrl?: string;
  suiRpcUrl?: string;
  suiNetwork?: string;
  serverSuiPrivateKeys?: string[];
  walrusOwnerAddress?: string;
  actorWalletAddress?: string;
  sealServerConfigs?: string;
  sealKeyServers?: string[];
  sealThreshold?: number;
}): Promise<PackManifest[]> => {
  const refs = changedRefs(input.beforeRefs, input.afterRefs);
  if (refs.length === 0) {
    return [];
  }

  const tmpArtifactDir = await mkdtemp(join(tmpdir(), "octopus-artifact-"));

  try {
    const bundlePath = join(tmpArtifactDir, "snapshot.bundle");
    await runGit(["--git-dir", input.repoPath, "bundle", "create", bundlePath, "--all"]);

    const digest = await sha256File(bundlePath);
    const artifactStats = await stat(bundlePath);
    const repoId = `${input.owner}/${input.repo}`;
    const visibility = input.visibility ?? "public";
    const sourcePath = visibility === "private" ? join(tmpArtifactDir, "snapshot.bundle.sealed") : bundlePath;
    const sealEnvelope =
      visibility === "private"
        ? await encryptArtifactForRepo({
            sourcePath: bundlePath,
            outputPath: sourcePath,
            repoId,
            packageId: input.packageId,
            repoObjectId: input.repoObjectId,
            accountId: input.accountId,
            sealMode: input.sealMode,
            suiRpcUrl: input.suiRpcUrl,
            suiNetwork: input.suiNetwork,
            sealServerConfigs: input.sealServerConfigs,
            sealKeyServers: input.sealKeyServers,
            sealThreshold: input.sealThreshold,
            allowLocalSealFallback: !durableWalrusMode()
          })
        : undefined;
    const storedDigest = visibility === "private" ? await sha256File(sourcePath) : digest;
    const manifestDir = join(input.dataDir, "manifests", input.owner, input.repo);
    await mkdir(manifestDir, { recursive: true });

    const firstSeq = await nextManifestSequence(manifestDir);
    const createdAtMs = Date.now();
    const plannedRefs = refs.map((ref, index) => {
      const seq = firstSeq + index;
      return {
        ...ref,
        seq,
        manifestId: `${String(seq).padStart(8, "0")}-${refSlug(ref.refName)}-${digest.slice(0, 12)}`
      };
    });
    const artifactWalrusMetadata: WalrusBlobMetadata = {
      octopus_app: "octopus",
      octopus_repo_id: repoId,
      octopus_repo_object_id: input.repoObjectId ?? "",
      octopus_owner: input.owner,
      octopus_repo: input.repo,
      ...(input.actorWalletAddress ? { octopus_actor_wallet: input.actorWalletAddress } : {}),
      octopus_visibility: visibility,
      octopus_package_id: input.packageId ?? "",
      octopus_artifact_digest: digest,
      octopus_stored_artifact_digest: storedDigest,
      octopus_ref_count: String(plannedRefs.length),
      octopus_refs: plannedRefs.map((ref) => ref.refName).join("\n"),
      octopus_manifest_ids: plannedRefs.map((ref) => ref.manifestId).join("\n"),
      octopus_first_seq: String(firstSeq)
    };
    const storedArtifact = await storeArtifact({
      dataDir: input.dataDir,
      sourcePath,
      artifactDigest: storedDigest,
      metadata: artifactWalrusMetadata,
      walrusNetwork: input.walrusNetwork,
      walrusUploadRelayUrl: input.walrusUploadRelayUrl,
      suiRpcUrl: input.suiRpcUrl,
      serverSuiPrivateKeys: input.serverSuiPrivateKeys,
      walrusOwnerAddress: input.walrusOwnerAddress
    });

    const manifests: PackManifest[] = [];

    for (const ref of plannedRefs) {
      const manifest: PackManifest = {
        manifestId: ref.manifestId,
        repoId,
        owner: input.owner,
        repo: input.repo,
        actorWalletAddress: input.actorWalletAddress,
        refName: ref.refName,
        oldCommit: ref.oldCommit,
        newCommit: ref.newCommit,
        walrusBlobId: storedArtifact.blobId,
        walrusBlobObjectId: storedArtifact.blobObjectId,
        artifactDigest: digest,
        storedArtifactDigest: storedDigest,
        artifactSizeBytes: artifactStats.size,
        artifactPath: storedArtifact.storedArtifactPath,
        storageMode: storedArtifact.storageMode,
        walrusBlobOwnerAddress: storedArtifact.blobOwnerAddress,
        walrusOwnershipTransferred: storedArtifact.ownershipTransferred,
        visibility,
        encrypted: visibility === "private",
        sealEnvelope,
        walrusMetadata: {
          ...artifactWalrusMetadata,
          octopus_ref: ref.refName,
          octopus_manifest_id: ref.manifestId,
          octopus_seq: String(ref.seq)
        },
        isSnapshot: true,
        createdAtMs,
        seq: ref.seq
      };

      await writeFile(join(manifestDir, `${ref.manifestId}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
      manifests.push(manifest);
    }

    return manifests;
  } finally {
    await rm(tmpArtifactDir, { recursive: true, force: true });
  }
};

export const readRepoManifests = async (dataDir: string, owner: string, repo: string): Promise<PackManifest[]> => {
  const manifestDir = join(dataDir, "manifests", owner, repo);

  try {
    const files = await readdir(manifestDir);
    const manifests = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          const content = await readFile(join(manifestDir, file), "utf8");
          return JSON.parse(content) as PackManifest;
        })
    );

    return manifests.sort((a, b) => a.seq - b.seq || basename(a.manifestId).localeCompare(basename(b.manifestId)));
  } catch {
    return [];
  }
};
