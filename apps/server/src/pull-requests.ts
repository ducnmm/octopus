import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  envInt,
  type CreatePullRequestRequest,
  type MergePullRequestRequest,
  type PullRequestMergeStrategy
} from "@ducnmm/octopus-shared";
import type { AuthContext } from "./auth.js";
import type { ServerConfig } from "./config.js";
import { bareRepoPath, finalizeRefUpdate } from "./git.js";
import { listRefs } from "./artifacts.js";
import { resolveCommit, type IndexedCommit } from "./indexer.js";
import type { SuiRepoState } from "./sui.js";

type GitResult = {
  stdout: Buffer;
  stderr: Buffer;
};

export type PullRequestStatus = "open" | "closed" | "merged";

export type PullRequestStatusFilter = PullRequestStatus | "all";

export type { PullRequestMergeStrategy };

export type PullRequestComment = {
  id: number;
  authorAccountId: string;
  authorWalletAddress: string;
  body: string;
  createdAtMs: number;
};

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
  closedAtMs?: number;
  closedBy?: string;
  mergedAtMs?: number;
  mergedBy?: string;
  mergeCommit?: string;
  mergeStrategy?: PullRequestMergeStrategy;
  comments: PullRequestComment[];
};

export type PullRequestMergeability = {
  mergeable: boolean;
  reason?: string;
};

export type PullRequestMergeResult = {
  pullRequest: PullRequest;
  mergeCommit: string;
  branchDeleted: boolean;
  branchDeleteSkippedReason?: string;
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

const runGitWithCode = async (
  args: string[],
  env: NodeJS.ProcessEnv = process.env
): Promise<GitResult & { code: number }> => {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn("git", args, {
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      resolvePromise({
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
        code: code ?? -1
      });
    });
  });
};

const runGit = async (args: string[], env: NodeJS.ProcessEnv = process.env): Promise<GitResult> => {
  const result = await runGitWithCode(args, env);
  if (result.code !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString()}`);
  }
  return result;
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

const normalizeComment = (value: unknown): PullRequestComment | null => {
  const raw = value && typeof value === "object" ? (value as Partial<PullRequestComment>) : {};
  if (typeof raw.id !== "number" || typeof raw.body !== "string" || typeof raw.createdAtMs !== "number") {
    return null;
  }

  return {
    id: raw.id,
    authorAccountId: typeof raw.authorAccountId === "string" ? raw.authorAccountId : "",
    authorWalletAddress: typeof raw.authorWalletAddress === "string" ? raw.authorWalletAddress : "",
    body: raw.body,
    createdAtMs: raw.createdAtMs
  };
};

// Tolerates store files written before the lifecycle fields existed: missing
// comments become an empty list and unknown statuses fall back to "open".
const normalizePullRequest = (value: PullRequest): PullRequest => {
  const status: PullRequestStatus = value.status === "closed" || value.status === "merged" ? value.status : "open";
  const comments = Array.isArray(value.comments)
    ? value.comments.map(normalizeComment).filter((comment): comment is PullRequestComment => comment !== null)
    : [];
  return { ...value, status, comments };
};

const normalizeStore = (value: unknown): PullRequestStore => {
  const raw = value && typeof value === "object" ? (value as Partial<PullRequestStore>) : {};
  const pullRequests = (Array.isArray(raw.pullRequests) ? raw.pullRequests : []).map(normalizePullRequest);
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

export const listPullRequests = async (
  config: ServerConfig,
  owner: string,
  repo: string,
  status: PullRequestStatusFilter = "all"
): Promise<PullRequest[]> => {
  const store = await readStore(config, owner, repo);
  return store.pullRequests
    .filter((pullRequest) => status === "all" || pullRequest.status === status)
    .sort((a, b) => b.number - a.number);
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
    updatedAtMs: now,
    comments: []
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

  // Open PRs compare live branches; closed/merged PRs keep comparing the
  // commits captured at close/merge time (the head branch may be deleted).
  const live = pullRequest.status === "open";
  const baseCommit = live ? await resolveCommit(repoPath, pullRequest.baseRef) : pullRequest.baseCommit;
  const headCommit = live ? await resolveCommit(repoPath, pullRequest.headRef) : pullRequest.headCommit;
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

const findPullRequest = (store: PullRequestStore, number: number): PullRequest => {
  const pullRequest = store.pullRequests.find((candidate) => candidate.number === number);
  if (!pullRequest) {
    throw httpError("Pull request not found", 404);
  }
  return pullRequest;
};

const requireAuth = (auth: AuthContext | null, action: string): AuthContext => {
  if (!auth) {
    throw httpError(`Authentication is required to ${action}`, 401);
  }
  return auth;
};

const isAncestor = async (repoPath: string, ancestor: string, descendant: string): Promise<boolean> => {
  return (
    (await runGitWithCode(["--git-dir", repoPath, "merge-base", "--is-ancestor", ancestor, descendant])).code === 0
  );
};

/**
 * Re-resolves head/base commits of an open PR against the live branches and
 * persists changes. PRs whose head landed on the base branch (fast-forward or
 * merge-commit pushes outside the merge endpoint, or a merge whose store write
 * failed) self-heal to "merged" here.
 */
export const refreshPullRequest = async (
  config: ServerConfig,
  state: SuiRepoState,
  number: number
): Promise<PullRequest> => {
  const store = await readStore(config, state.owner, state.repo);
  const pullRequest = findPullRequest(store, number);
  if (pullRequest.status !== "open") {
    return pullRequest;
  }

  const repoPath = bareRepoPath(config.repoRoot, state.owner, state.repo);
  await assertRepoCache(repoPath, state);
  const baseCommit = await resolveCommit(repoPath, pullRequest.baseRef);
  const headCommit = await resolveCommit(repoPath, pullRequest.headRef);
  if (!baseCommit || !headCommit) {
    return pullRequest;
  }

  let changed = false;
  if (baseCommit !== pullRequest.baseCommit || headCommit !== pullRequest.headCommit) {
    pullRequest.baseCommit = baseCommit;
    pullRequest.headCommit = headCommit;
    changed = true;
  }

  if (await isAncestor(repoPath, headCommit, baseCommit)) {
    pullRequest.status = "merged";
    pullRequest.mergedAtMs = Date.now();
    changed = true;
  }

  if (changed) {
    pullRequest.updatedAtMs = Date.now();
    await writeStore(config, state.owner, state.repo, store);
  }

  return pullRequest;
};

export const closePullRequest = async (
  config: ServerConfig,
  state: SuiRepoState,
  number: number,
  auth: AuthContext | null
): Promise<PullRequest> => {
  const actor = requireAuth(auth, "close a pull request");
  const store = await readStore(config, state.owner, state.repo);
  const pullRequest = findPullRequest(store, number);
  if (pullRequest.status !== "open") {
    throw httpError(`Pull request #${number} is ${pullRequest.status} and cannot be closed`, 405);
  }

  const now = Date.now();
  pullRequest.status = "closed";
  pullRequest.closedAtMs = now;
  pullRequest.closedBy = actor.walletAddress;
  pullRequest.updatedAtMs = now;
  await writeStore(config, state.owner, state.repo, store);
  return pullRequest;
};

export const reopenPullRequest = async (
  config: ServerConfig,
  state: SuiRepoState,
  number: number,
  auth: AuthContext | null
): Promise<PullRequest> => {
  requireAuth(auth, "reopen a pull request");
  const store = await readStore(config, state.owner, state.repo);
  const pullRequest = findPullRequest(store, number);
  if (pullRequest.status !== "closed") {
    throw httpError(`Pull request #${number} is ${pullRequest.status} and cannot be reopened`, 405);
  }

  const duplicate = store.pullRequests.find(
    (candidate) =>
      candidate.status === "open" &&
      candidate.baseRef === pullRequest.baseRef &&
      candidate.headRef === pullRequest.headRef
  );
  if (duplicate) {
    throw httpError(`Pull request #${duplicate.number} is already open for these branches`, 409);
  }

  const repoPath = bareRepoPath(config.repoRoot, state.owner, state.repo);
  await assertRepoCache(repoPath, state);
  const baseCommit = await resolveCommit(repoPath, pullRequest.baseRef);
  if (!baseCommit) {
    throw httpError(`Base branch no longer exists: ${shortRef(pullRequest.baseRef)}`, 409);
  }
  const headCommit = await resolveCommit(repoPath, pullRequest.headRef);
  if (!headCommit) {
    throw httpError(`Head branch no longer exists: ${shortRef(pullRequest.headRef)}`, 409);
  }

  const now = Date.now();
  pullRequest.status = "open";
  pullRequest.closedAtMs = undefined;
  pullRequest.closedBy = undefined;
  pullRequest.baseCommit = baseCommit;
  pullRequest.headCommit = headCommit;
  pullRequest.updatedAtMs = now;
  await writeStore(config, state.owner, state.repo, store);
  return pullRequest;
};

export const addPullRequestComment = async (
  config: ServerConfig,
  state: SuiRepoState,
  number: number,
  body: string,
  auth: AuthContext | null
): Promise<{ pullRequest: PullRequest; comment: PullRequestComment }> => {
  const actor = requireAuth(auth, "comment on a pull request");
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 10_000) {
    throw httpError("Comment body must be between 1 and 10,000 characters", 400);
  }

  const store = await readStore(config, state.owner, state.repo);
  const pullRequest = findPullRequest(store, number);
  const now = Date.now();
  const comment: PullRequestComment = {
    id: pullRequest.comments.reduce((max, existing) => Math.max(max, existing.id), 0) + 1,
    authorAccountId: actor.accountId,
    authorWalletAddress: actor.walletAddress,
    body: trimmed,
    createdAtMs: now
  };
  pullRequest.comments.push(comment);
  pullRequest.updatedAtMs = now;
  await writeStore(config, state.owner, state.repo, store);
  return { pullRequest, comment };
};

export const listPullRequestComments = async (
  config: ServerConfig,
  owner: string,
  repo: string,
  number: number
): Promise<PullRequestComment[]> => {
  const store = await readStore(config, owner, repo);
  return [...findPullRequest(store, number).comments].sort((a, b) => a.createdAtMs - b.createdAtMs || a.id - b.id);
};

// `git merge-tree --write-tree` exits 0 with the merged tree OID on the first
// stdout line, 1 on content conflicts, and <0/other on usage errors.
const mergeTree = async (
  repoPath: string,
  baseCommit: string,
  headCommit: string
): Promise<{ treeOid: string | null; conflict: boolean }> => {
  const result = await runGitWithCode(["--git-dir", repoPath, "merge-tree", "--write-tree", baseCommit, headCommit]);
  if (result.code !== 0 && result.code !== 1) {
    throw new Error(`git merge-tree failed: ${result.stderr.toString()}`);
  }

  const treeOid = result.stdout.toString("utf8").split(/\r?\n/)[0]?.trim() || null;
  return { treeOid, conflict: result.code === 1 };
};

export const assessPullRequestMergeability = async (
  config: ServerConfig,
  state: SuiRepoState,
  pullRequest: PullRequest
): Promise<PullRequestMergeability> => {
  if (pullRequest.status !== "open") {
    return { mergeable: false, reason: `Pull request is ${pullRequest.status}` };
  }

  const repoPath = bareRepoPath(config.repoRoot, state.owner, state.repo);
  await assertRepoCache(repoPath, state);
  const baseCommit = await resolveCommit(repoPath, pullRequest.baseRef);
  const headCommit = await resolveCommit(repoPath, pullRequest.headRef);
  if (!baseCommit || !headCommit) {
    return { mergeable: false, reason: "Pull request branch no longer resolves to a commit" };
  }

  const { conflict } = await mergeTree(repoPath, baseCommit, headCommit);
  return conflict
    ? { mergeable: false, reason: "Merge conflicts must be resolved before merging" }
    : { mergeable: true };
};

const mergeActorEnv = (actor: AuthContext): NodeJS.ProcessEnv => ({
  ...process.env,
  GIT_AUTHOR_NAME: actor.walletAddress,
  GIT_AUTHOR_EMAIL: `${actor.walletAddress}@octopus.local`,
  GIT_COMMITTER_NAME: "Octopus",
  GIT_COMMITTER_EMAIL: "server@octopus.local"
});

const createMergeCommit = async (input: {
  repoPath: string;
  strategy: PullRequestMergeStrategy;
  pullRequest: PullRequest;
  baseCommit: string;
  headCommit: string;
  actor: AuthContext;
}): Promise<string> => {
  const { repoPath, strategy, pullRequest, baseCommit, headCommit, actor } = input;

  if (strategy === "fast-forward") {
    if (!(await isAncestor(repoPath, baseCommit, headCommit))) {
      throw httpError("Base branch has diverged from head; fast-forward merge is not possible", 409);
    }
    return headCommit;
  }

  const { treeOid, conflict } = await mergeTree(repoPath, baseCommit, headCommit);
  if (conflict || !treeOid) {
    throw httpError("Merge conflicts must be resolved before merging", 409);
  }

  const message =
    strategy === "squash"
      ? [`${pullRequest.title} (#${pullRequest.number})`, pullRequest.body].filter(Boolean).join("\n\n")
      : [`Merge pull request #${pullRequest.number} from ${shortRef(pullRequest.headRef)}`, pullRequest.title].join(
          "\n\n"
        );
  const parents = strategy === "squash" ? ["-p", baseCommit] : ["-p", baseCommit, "-p", headCommit];
  const result = await runGit(
    ["--git-dir", repoPath, "commit-tree", treeOid, ...parents, "-m", message],
    mergeActorEnv(actor)
  );
  return result.stdout.toString("utf8").trim();
};

const branchDeleteEligibility = (
  store: PullRequestStore,
  state: SuiRepoState,
  pullRequest: PullRequest
): string | null => {
  if (pullRequest.headRef === normalizeBranchRef(state.defaultBranch)) {
    return "Head branch is the repository default branch";
  }

  const dependent = store.pullRequests.find(
    (candidate) =>
      candidate.status === "open" &&
      candidate.number !== pullRequest.number &&
      candidate.baseRef === pullRequest.headRef
  );
  return dependent ? `Pull request #${dependent.number} targets this branch as base` : null;
};

export const mergePullRequest = async (
  config: ServerConfig,
  state: SuiRepoState,
  number: number,
  input: MergePullRequestRequest,
  auth: AuthContext | null
): Promise<PullRequestMergeResult> => {
  const actor = requireAuth(auth, "merge a pull request");
  const store = await readStore(config, state.owner, state.repo);
  const pullRequest = findPullRequest(store, number);
  if (pullRequest.status !== "open") {
    throw httpError(`Pull request #${number} is ${pullRequest.status} and cannot be merged`, 405);
  }

  const repoPath = bareRepoPath(config.repoRoot, state.owner, state.repo);
  await assertRepoCache(repoPath, state);
  const baseCommit = await resolveCommit(repoPath, pullRequest.baseRef);
  const headCommit = await resolveCommit(repoPath, pullRequest.headRef);
  if (!baseCommit || !headCommit) {
    throw httpError("Pull request branch no longer resolves to a commit", 409);
  }

  if (headCommit !== input.expectedHeadCommit) {
    throw httpError("Head branch moved since the pull request was reviewed. Refresh and review again.", 409);
  }

  const mergeCommit = await createMergeCommit({
    repoPath,
    strategy: input.strategy,
    pullRequest,
    baseCommit,
    headCommit,
    actor
  });

  // Compare-and-swap: a concurrent push or merge to the base branch makes
  // update-ref fail instead of silently clobbering it.
  const casUpdate = await runGitWithCode([
    "--git-dir",
    repoPath,
    "update-ref",
    pullRequest.baseRef,
    mergeCommit,
    baseCommit
  ]);
  if (casUpdate.code !== 0) {
    throw httpError("Base branch changed while merging. Refresh and try again.", 409);
  }

  let branchDeleted = false;
  let branchDeleteSkippedReason: string | undefined;
  if (input.deleteBranch) {
    const ineligible = branchDeleteEligibility(store, state, pullRequest);
    if (ineligible) {
      branchDeleteSkippedReason = ineligible;
    } else {
      const deletion = await runGitWithCode([
        "--git-dir",
        repoPath,
        "update-ref",
        "-d",
        pullRequest.headRef,
        headCommit
      ]);
      if (deletion.code === 0) {
        branchDeleted = true;
      } else {
        branchDeleteSkippedReason = "Head branch changed while merging and was kept";
      }
    }
  }

  // Anchor the ref change exactly like a push; on failure the cache refs are
  // rolled back inside finalizeRefUpdate and the PR stays open.
  await finalizeRefUpdate({
    config,
    repoPath,
    owner: state.owner,
    repo: state.repo,
    repoState: state,
    auth: actor,
    afterRefs: await listRefs(repoPath)
  });

  const now = Date.now();
  pullRequest.status = "merged";
  pullRequest.baseCommit = baseCommit;
  pullRequest.headCommit = headCommit;
  pullRequest.mergedAtMs = now;
  pullRequest.mergedBy = actor.walletAddress;
  pullRequest.mergeCommit = mergeCommit;
  pullRequest.mergeStrategy = input.strategy;
  pullRequest.updatedAtMs = now;
  await writeStore(config, state.owner, state.repo, store);
  return { pullRequest, mergeCommit, branchDeleted, branchDeleteSkippedReason };
};
