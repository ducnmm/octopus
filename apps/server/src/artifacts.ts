import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { storeArtifact } from "./walrus.js";

export type GitRefMap = Map<string, string>;

export type PackManifest = {
  manifestId: string;
  repoId: string;
  owner: string;
  repo: string;
  refName: string;
  oldCommit: string | null;
  newCommit: string;
  walrusBlobId: string;
  walrusBlobObjectId?: string;
  artifactDigest: string;
  artifactSizeBytes: number;
  artifactPath: string;
  storageMode: "local" | "walrus-cli";
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
  const result = await runGit([
    "--git-dir",
    repoPath,
    "for-each-ref",
    "--format=%(refname) %(objectname)"
  ]);
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

const changedRefs = (before: GitRefMap, after: GitRefMap): Array<{
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
    const oldCommit = before.get(refName) ?? null;
    if (oldCommit !== newCommit) {
      changed.push({ refName, oldCommit, newCommit });
    }
  }

  return changed;
};

export const createPushArtifacts = async (input: {
  dataDir: string;
  repoPath: string;
  owner: string;
  repo: string;
  beforeRefs: GitRefMap;
  afterRefs: GitRefMap;
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
    const storedArtifact = await storeArtifact({
      dataDir: input.dataDir,
      sourcePath: bundlePath,
      artifactDigest: digest
    });

    const manifestDir = join(input.dataDir, "manifests", input.owner, input.repo);
    await mkdir(manifestDir, { recursive: true });

    const manifests: PackManifest[] = [];
    let seq = await nextManifestSequence(manifestDir);
    const createdAtMs = Date.now();

    for (const ref of refs) {
      const manifestId = `${String(seq).padStart(8, "0")}-${refSlug(ref.refName)}-${digest.slice(0, 12)}`;
      const manifest: PackManifest = {
        manifestId,
        repoId: `${input.owner}/${input.repo}`,
        owner: input.owner,
        repo: input.repo,
        refName: ref.refName,
        oldCommit: ref.oldCommit,
        newCommit: ref.newCommit,
        walrusBlobId: storedArtifact.blobId,
        walrusBlobObjectId: storedArtifact.blobObjectId,
        artifactDigest: digest,
        artifactSizeBytes: artifactStats.size,
        artifactPath: storedArtifact.storedArtifactPath,
        storageMode: storedArtifact.storageMode,
        isSnapshot: true,
        createdAtMs,
        seq
      };

      await writeFile(
        join(manifestDir, `${manifestId}.json`),
        `${JSON.stringify(manifest, null, 2)}\n`
      );
      manifests.push(manifest);
      seq += 1;
    }

    return manifests;
  } finally {
    await rm(tmpArtifactDir, { recursive: true, force: true });
  }
};

export const readRepoManifests = async (
  dataDir: string,
  owner: string,
  repo: string
): Promise<PackManifest[]> => {
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
