import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { envInt } from "@octopus/shared";
import type { ServerConfig } from "./config.js";
import { bareRepoPath } from "./git.js";
import type { SuiRepoState } from "./sui.js";

type GitResult = {
  stdout: Buffer;
  stderr: Buffer;
};

export type IndexedCommit = {
  oid: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  subject: string;
  refs: string[];
};

export type TreeEntry = {
  path: string;
  name: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  objectId: string;
  size: number | null;
};

export type BlobView = {
  path: string;
  objectId: string;
  size: number;
  encoding: "utf8" | "base64";
  content: string;
  truncated: boolean;
};

export type RepoIndex = {
  version: 1;
  repoId: string;
  owner: string;
  repo: string;
  defaultBranch: string;
  headCommit: string | null;
  commitCount: number;
  treeEntryCount: number;
  treeTruncated: boolean;
  commits: IndexedCommit[];
  treeEntries: TreeEntry[];
  indexedAtMs: number;
};

const COMMIT_LIMIT = 100;
const TREE_ENTRY_LIMIT = envInt(process.env.OCTOPUS_INDEX_TREE_LIMIT, 5_000);
const BLOB_VIEW_LIMIT_BYTES = envInt(process.env.OCTOPUS_BLOB_VIEW_LIMIT_BYTES, 1024 * 1024);

const runGit = async (args: string[], input?: Buffer): Promise<GitResult> => {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn("git", args, {
      stdio: ["pipe", "pipe", "pipe"]
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

    child.stdin.end(input);
  });
};

const indexPath = (config: ServerConfig, owner: string, repo: string): string => {
  return join(config.dataDir, "index", owner, `${repo}.json`);
};

const notIndexed = (state: SuiRepoState): RepoIndex => ({
  version: 1,
  repoId: state.repoId,
  owner: state.owner,
  repo: state.repo,
  defaultBranch: state.defaultBranch,
  headCommit: null,
  commitCount: 0,
  treeEntryCount: 0,
  treeTruncated: false,
  commits: [],
  treeEntries: [],
  indexedAtMs: Date.now()
});

const normalizeRepoPath = (rawPath: string | undefined): string => {
  const value = (rawPath ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (value.includes("\0")) {
    throw new Error("Path contains an invalid NUL byte");
  }

  const parts = value.split("/").filter((part) => part && part !== ".");
  if (parts.includes("..")) {
    throw new Error("Path must not contain parent directory segments");
  }

  return parts.join("/");
};

const repoUnavailableError = (owner: string, repo: string): Error & { statusCode: number } => {
  const error = new Error(`Repository cache is unavailable for ${owner}/${repo}. Restore it before browsing files.`) as Error & {
    statusCode: number;
  };
  error.statusCode = 409;
  return error;
};

const assertRepoCache = async (repoPath: string, owner: string, repo: string): Promise<void> => {
  try {
    await access(repoPath);
  } catch {
    throw repoUnavailableError(owner, repo);
  }
};

export const resolveCommit = async (
  repoPath: string,
  revision: string
): Promise<string | null> => {
  const trimmed = revision.trim();
  const candidates = [
    trimmed,
    trimmed.startsWith("refs/") ? "" : `refs/heads/${trimmed}`,
    trimmed.startsWith("refs/") ? "" : `refs/tags/${trimmed}`
  ].filter(Boolean);

  for (const candidate of [...new Set(candidates)]) {
    try {
      const result = await runGit(["--git-dir", repoPath, "rev-parse", "--verify", `${candidate}^{commit}`]);
      return result.stdout.toString("utf8").trim();
    } catch {
      // Try the next revision spelling.
    }
  }

  return null;
};

const parseCommits = (raw: string): IndexedCommit[] => {
  return raw
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [oid = "", parents = "", authorName = "", authorEmail = "", authoredAt = "", subject = "", refs = ""] =
        record.split("\x1f");
      return {
        oid,
        parents: parents ? parents.split(" ").filter(Boolean) : [],
        authorName,
        authorEmail,
        authoredAt,
        subject,
        refs: refs
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      };
    });
};

export const readCommits = async (
  repoPath: string,
  revision: string,
  limit = COMMIT_LIMIT
): Promise<IndexedCommit[]> => {
  const commit = await resolveCommit(repoPath, revision);
  if (!commit) {
    return [];
  }

  const result = await runGit([
    "--git-dir",
    repoPath,
    "log",
    `--max-count=${Math.max(1, Math.min(limit, 500))}`,
    "--date=iso-strict",
    "--pretty=format:%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%D%x1e",
    commit
  ]);
  return parseCommits(result.stdout.toString("utf8"));
};

const parseTree = (raw: Buffer, parentPath: string): TreeEntry[] => {
  return raw
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((record) => {
      const separator = record.indexOf("\t");
      const meta = separator >= 0 ? record.slice(0, separator) : record;
      const name = separator >= 0 ? record.slice(separator + 1) : "";
      const match = meta.match(/^(\d{6}) (blob|tree|commit) ([0-9a-fA-F]+)\s+(-|\d+)$/);
      if (!match) {
        throw new Error(`Could not parse git tree entry: ${record}`);
      }

      return {
        path: parentPath ? `${parentPath}/${name}` : name,
        name,
        mode: match[1] ?? "",
        type: (match[2] ?? "blob") as TreeEntry["type"],
        objectId: match[3] ?? "",
        size: match[4] === "-" ? null : Number.parseInt(match[4] ?? "0", 10)
      };
    });
};

export const readTree = async (
  repoPath: string,
  revision: string,
  rawPath = ""
): Promise<TreeEntry[]> => {
  const commit = await resolveCommit(repoPath, revision);
  if (!commit) {
    return [];
  }

  const path = normalizeRepoPath(rawPath);
  const treeish = `${commit}:${path}`;
  const result = await runGit(["--git-dir", repoPath, "ls-tree", "-z", "-l", treeish]);
  return parseTree(result.stdout, path).sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "tree" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
};

const readRecursiveTree = async (
  repoPath: string,
  revision: string
): Promise<{ entries: TreeEntry[]; truncated: boolean }> => {
  const commit = await resolveCommit(repoPath, revision);
  if (!commit) {
    return { entries: [], truncated: false };
  }

  const result = await runGit(["--git-dir", repoPath, "ls-tree", "-r", "-z", "-l", commit]);
  const entries = parseTree(result.stdout, "");
  return {
    entries: entries.slice(0, TREE_ENTRY_LIMIT),
    truncated: entries.length > TREE_ENTRY_LIMIT
  };
};

const isUtf8 = (content: Buffer): boolean => {
  if (content.includes(0)) {
    return false;
  }

  return Buffer.from(content.toString("utf8"), "utf8").equals(content);
};

export const readBlob = async (
  repoPath: string,
  revision: string,
  rawPath: string
): Promise<BlobView> => {
  const path = normalizeRepoPath(rawPath);
  if (!path) {
    throw new Error("File path is required");
  }

  const commit = await resolveCommit(repoPath, revision);
  if (!commit) {
    throw new Error(`Revision not found: ${revision}`);
  }

  const objectSpec = `${commit}:${path}`;
  const type = (await runGit(["--git-dir", repoPath, "cat-file", "-t", objectSpec])).stdout
    .toString("utf8")
    .trim();
  if (type !== "blob") {
    throw new Error(`${path} is not a file`);
  }

  const objectId = (await runGit(["--git-dir", repoPath, "rev-parse", objectSpec])).stdout.toString("utf8").trim();
  const size = Number.parseInt(
    (await runGit(["--git-dir", repoPath, "cat-file", "-s", objectSpec])).stdout.toString("utf8").trim(),
    10
  );
  const content = (await runGit(["--git-dir", repoPath, "cat-file", "-p", objectSpec])).stdout;
  const truncated = content.length > BLOB_VIEW_LIMIT_BYTES;
  const viewContent = truncated ? content.subarray(0, BLOB_VIEW_LIMIT_BYTES) : content;
  const encoding = isUtf8(viewContent) ? "utf8" : "base64";

  return {
    path,
    objectId,
    size,
    encoding,
    content: encoding === "utf8" ? viewContent.toString("utf8") : viewContent.toString("base64"),
    truncated
  };
};

export const indexRepository = async (
  config: ServerConfig,
  state: SuiRepoState
): Promise<RepoIndex> => {
  const repoPath = bareRepoPath(config.repoRoot, state.owner, state.repo);
  await assertRepoCache(repoPath, state.owner, state.repo);

  const headCommit = await resolveCommit(repoPath, state.defaultBranch);
  const commits = headCommit ? await readCommits(repoPath, headCommit, COMMIT_LIMIT) : [];
  const tree = headCommit ? await readRecursiveTree(repoPath, headCommit) : { entries: [], truncated: false };
  const index: RepoIndex = {
    version: 1,
    repoId: state.repoId,
    owner: state.owner,
    repo: state.repo,
    defaultBranch: state.defaultBranch,
    headCommit,
    commitCount: commits.length,
    treeEntryCount: tree.entries.length,
    treeTruncated: tree.truncated,
    commits,
    treeEntries: tree.entries,
    indexedAtMs: Date.now()
  };

  const path = indexPath(config, state.owner, state.repo);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(index, null, 2)}\n`);
  return index;
};

const readIndex = async (
  config: ServerConfig,
  owner: string,
  repo: string
): Promise<RepoIndex | null> => {
  try {
    return JSON.parse(await readFile(indexPath(config, owner, repo), "utf8")) as RepoIndex;
  } catch {
    return null;
  }
};

export const ensureRepoIndex = async (
  config: ServerConfig,
  state: SuiRepoState
): Promise<RepoIndex> => {
  const repoPath = bareRepoPath(config.repoRoot, state.owner, state.repo);
  await assertRepoCache(repoPath, state.owner, state.repo);

  const headCommit = await resolveCommit(repoPath, state.defaultBranch);
  const current = await readIndex(config, state.owner, state.repo);
  if (current?.headCommit === headCommit && current.defaultBranch === state.defaultBranch) {
    return current;
  }

  if (!headCommit) {
    const empty = notIndexed(state);
    const path = indexPath(config, state.owner, state.repo);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(empty, null, 2)}\n`);
    return empty;
  }

  return await indexRepository(config, state);
};
