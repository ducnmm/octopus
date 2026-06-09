import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { envInt, type CreatePullRequestRequest } from "@ducnmm/octopus-shared";
import type { AuthContext } from "./auth.js";
import type { ServerConfig } from "./config.js";
import { bareRepoPath } from "./git.js";
import { resolveCommit, type IndexedCommit } from "./indexer.js";
import type { SuiRepoState } from "./sui.js";

type GitResult = {
  stdout: Buffer;
  stderr: Buffer;
};

export type PullRequestStatus = "open" | "closed";

export type PullRequest = {
  number: number;
  owner: string;
  repo: string;
  repoId: string;
  title: string;
  body: string;
  status: PullRequestStatus;
  baseRef: string;
  headRef: string;
  baseCommit: string;
  headCommit: string;
  authorAccountId: string;
  authorWalletAddress: string;
  createdAtMs: number;
  updatedAtMs: number;
};

export type PullRequestDiffFile = {
  path: string;
  additions: number;
  deletions: number;
  binary: boolean;
};

export type PullRequestComparison = {
  baseCommit: string;
  headCommit: string;
  mergeBaseCommit: string;
  commits: IndexedCommit[];
  files: PullRequestDiffFile[];
  commitCount: number;
  fileCount: number;
  additions: number;
  deletions: number;
  patch: string;
  patchTruncated: boolean;
};

type PullRequestStore = {
  version: 1;
  nextNumber: number;
  pullRequests: PullRequest[];
};

const PATCH_LIMIT_BYTES = envInt(process.env.OCTOPUS_PULL_REQUEST_PATCH_LIMIT_BYTES, 512 * 1024);

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

const runGitStdoutPrefix = async (
  args: string[],
  maxBytes: number
): Promise<{ stdout: Buffer; truncated: boolean }> => {
  if (maxBytes <= 0) {
    return { stdout: Buffer.alloc(0), truncated: true };
  }

  return await new Promise((resolvePromise, reject) => {
    const child = spawn("git", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    let stoppedAfterLimit = false;

    child.stdout.on("data", (chunk: Buffer) => {
      if (bytes < maxBytes) {
        const remaining = maxBytes - bytes;
        stdout.push(chunk.length > remaining ? chunk.subarray(0, remaining) : chunk);
      }
      bytes += chunk.length;
      if (bytes >= maxBytes && !stoppedAfterLimit) {
        stoppedAfterLimit = true;
        child.kill("SIGTERM");
      }
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0 || stoppedAfterLimit || signal === "SIGTERM") {
        resolvePromise({
          stdout: Buffer.concat(stdout),
          truncated: stoppedAfterLimit
        });
        return;
      }

      reject(new Error(`git ${args.join(" ")} failed: ${Buffer.concat(stderr).toString()}`));
    });
  });
};

const httpError = (message: string, statusCode: number): Error & { statusCode: number } => {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
};

const pullRequestStorePath = (config: ServerConfig, owner: string, repo: string): string => {
  return join(config.dataDir, "pull-requests", owner, `${repo}.json`);
};

const emptyStore = (): PullRequestStore => ({
  version: 1,
  nextNumber: 1,
  pullRequests: []
});

const normalizeStore = (value: unknown): PullRequestStore => {
  const raw = value && typeof value === "object" ? (value as Partial<PullRequestStore>) : {};
  const pullRequests = Array.isArray(raw.pullRequests) ? raw.pullRequests : [];
  const maxNumber = pullRequests.reduce((max, pullRequest) => {
    return Math.max(max, typeof pullRequest.number === "number" ? pullRequest.number : 0);
  }, 0);

  return {
    version: 1,
    nextNumber: typeof raw.nextNumber === "number" && raw.nextNumber > maxNumber ? raw.nextNumber : maxNumber + 1,
    pullRequests
  };
};

const readStore = async (config: ServerConfig, owner: string, repo: string): Promise<PullRequestStore> => {
  try {
    return normalizeStore(JSON.parse(await readFile(pullRequestStorePath(config, owner, repo), "utf8")));
  } catch {
    return emptyStore();
  }
};

const writeStore = async (
  config: ServerConfig,
  owner: string,
  repo: string,
  store: PullRequestStore
): Promise<void> => {
  const path = pullRequestStorePath(config, owner, repo);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`);
};

const assertRepoCache = async (repoPath: string, state: SuiRepoState): Promise<void> => {
  try {
    await access(repoPath);
  } catch {
    throw httpError(
      `Repository cache is unavailable for ${state.repoId}. Restore it before opening pull requests.`,
      409
    );
  }
};

const shortRef = (ref: string): string => {
  return ref.replace(/^refs\/heads\//, "");
};

const normalizeBranchRef = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.startsWith("refs/") && !trimmed.startsWith("refs/heads/")) {
    throw httpError("Pull requests currently support branch refs only", 400);
  }

  const branch = trimmed.replace(/^refs\/heads\//, "");
  if (!branch) {
    throw httpError("Branch ref is required", 400);
  }

  return `refs/heads/${branch}`;
};

const parseCommits = (raw: string): IndexedCommit[] => {
  return raw
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [
        oid = "",
        parents = "",
        authorName = "",
        authorEmail = "",
        authoredAt = "",
        committerName = "",
        committerEmail = "",
        committedAt = "",
        subject = "",
        refs = ""
      ] = record.split("\x1f");
      return {
        oid,
        parents: parents ? parents.split(" ").filter(Boolean) : [],
        authorName,
        authorEmail,
        authoredAt,
        committerName,
        committerEmail,
        committedAt,
        subject,
        refs: refs
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      };
    });
};

const readRangeCommits = async (repoPath: string, fromCommit: string, toCommit: string): Promise<IndexedCommit[]> => {
  if (fromCommit === toCommit) {
    return [];
  }

  const result = await runGit([
    "--git-dir",
    repoPath,
    "log",
    "--max-count=250",
    "--date=iso-strict",
    "--pretty=format:%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%cn%x1f%ce%x1f%cI%x1f%s%x1f%D%x1e",
    `${fromCommit}..${toCommit}`
  ]);
  return parseCommits(result.stdout.toString("utf8"));
};

const readMergeBase = async (repoPath: string, baseCommit: string, headCommit: string): Promise<string> => {
  try {
    return (await runGit(["--git-dir", repoPath, "merge-base", baseCommit, headCommit])).stdout.toString("utf8").trim();
  } catch {
    throw httpError("Pull request branches do not share a common history", 409);
  }
};

const parseDiffStats = (raw: string): PullRequestDiffFile[] => {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [added = "0", deleted = "0", ...pathParts] = line.split("\t");
      const binary = added === "-" || deleted === "-";
      return {
        path: pathParts.join("\t"),
        additions: binary ? 0 : Number.parseInt(added, 10) || 0,
        deletions: binary ? 0 : Number.parseInt(deleted, 10) || 0,
        binary
      };
    })
    .filter((file) => file.path.length > 0);
};

export const listPullRequests = async (config: ServerConfig, owner: string, repo: string): Promise<PullRequest[]> => {
  const store = await readStore(config, owner, repo);
  return [...store.pullRequests].sort((a, b) => b.number - a.number);
};

export const readPullRequest = async (
  config: ServerConfig,
  owner: string,
  repo: string,
  number: number
): Promise<PullRequest | null> => {
  const store = await readStore(config, owner, repo);
  return store.pullRequests.find((pullRequest) => pullRequest.number === number) ?? null;
};

export const createPullRequest = async (
  config: ServerConfig,
  state: SuiRepoState,
  input: CreatePullRequestRequest,
  auth: AuthContext | null
): Promise<PullRequest> => {
  if (!auth) {
    throw httpError("Authentication is required to open a pull request", 401);
  }

  const baseRef = normalizeBranchRef(input.baseRef ?? state.defaultBranch);
  const headRef = normalizeBranchRef(input.headRef);
  if (baseRef === headRef) {
    throw httpError("Base and head branches must be different", 400);
  }

  const repoPath = bareRepoPath(config.repoRoot, state.owner, state.repo);
  await assertRepoCache(repoPath, state);
  const baseCommit = await resolveCommit(repoPath, baseRef);
  if (!baseCommit) {
    throw httpError(`Base branch not found: ${shortRef(baseRef)}`, 400);
  }

  const headCommit = await resolveCommit(repoPath, headRef);
  if (!headCommit) {
    throw httpError(`Head branch not found: ${shortRef(headRef)}`, 400);
  }

  const mergeBase = await readMergeBase(repoPath, baseCommit, headCommit);
  const commits = await readRangeCommits(repoPath, mergeBase, headCommit);
  if (commits.length === 0) {
    throw httpError("Head branch has no commits to merge into the base branch", 400);
  }

  const store = await readStore(config, state.owner, state.repo);
  const duplicate = store.pullRequests.find(
    (pullRequest) => pullRequest.status === "open" && pullRequest.baseRef === baseRef && pullRequest.headRef === headRef
  );
  if (duplicate) {
    throw httpError(`Pull request #${duplicate.number} is already open for these branches`, 409);
  }

  const now = Date.now();
  const pullRequest: PullRequest = {
    number: store.nextNumber,
    owner: state.owner,
    repo: state.repo,
    repoId: state.repoId,
    title: input.title,
    body: input.body,
    status: "open",
    baseRef,
    headRef,
    baseCommit,
    headCommit,
    authorAccountId: auth.accountId,
    authorWalletAddress: auth.walletAddress,
    createdAtMs: now,
    updatedAtMs: now
  };
  store.nextNumber += 1;
  store.pullRequests.push(pullRequest);
  await writeStore(config, state.owner, state.repo, store);
  return pullRequest;
};

export const comparePullRequest = async (
  config: ServerConfig,
  state: SuiRepoState,
  pullRequest: PullRequest
): Promise<PullRequestComparison> => {
  const repoPath = bareRepoPath(config.repoRoot, state.owner, state.repo);
  await assertRepoCache(repoPath, state);

  const baseCommit = await resolveCommit(repoPath, pullRequest.baseRef);
  const headCommit = await resolveCommit(repoPath, pullRequest.headRef);
  if (!baseCommit || !headCommit) {
    throw httpError("Pull request branch no longer resolves to a commit", 409);
  }

  const mergeBaseCommit = await readMergeBase(repoPath, baseCommit, headCommit);
  const commits = await readRangeCommits(repoPath, mergeBaseCommit, headCommit);
  const files = parseDiffStats(
    (
      await runGit(["--git-dir", repoPath, "diff", "--numstat", "--find-renames", mergeBaseCommit, headCommit])
    ).stdout.toString("utf8")
  );
  const patch = await runGitStdoutPrefix(
    ["--git-dir", repoPath, "diff", "--find-renames", "--patch", mergeBaseCommit, headCommit],
    PATCH_LIMIT_BYTES
  );

  return {
    baseCommit,
    headCommit,
    mergeBaseCommit,
    commits,
    files,
    commitCount: commits.length,
    fileCount: files.length,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
    patch: patch.stdout.toString("utf8"),
    patchTruncated: patch.truncated
  };
};
