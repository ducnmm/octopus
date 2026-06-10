import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { AuthContext } from "../src/auth.js";
import type { ServerConfig } from "../src/config.js";
import {
  addPullRequestComment,
  assessPullRequestMergeability,
  closePullRequest,
  createPullRequest,
  listPullRequestComments,
  listPullRequests,
  readPullRequest,
  refreshPullRequest,
  reopenPullRequest
} from "../src/pull-requests.js";
import type { SuiRepoState } from "../src/sui.js";

const execFileAsync = promisify(execFile);

const owner = "0xowner";
const repo = "demo";

let workspace: string;
let config: ServerConfig;
let state: SuiRepoState;
let sourceRepo: string;
let barePath: string;

const auth: AuthContext = {
  delegatePublicKey: "00",
  delegateAddress: "0xdelegate",
  accountId: "local:test-account",
  walletAddress: "0xowner-wallet",
  source: "local"
};

const git = async (args: string[], cwd?: string): Promise<string> => {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
};

const commitFile = async (path: string, content: string, message: string): Promise<string> => {
  await writeFile(join(sourceRepo, path), content);
  await git(["add", path], sourceRepo);
  await git(["commit", "-m", message], sourceRepo);
  return await git(["rev-parse", "HEAD"], sourceRepo);
};

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "octopus-pulls-"));
  const dataDir = join(workspace, "data");
  config = {
    host: "127.0.0.1",
    port: 0,
    dataDir,
    repoRoot: join(dataDir, "repos"),
    webUrl: "http://127.0.0.1:45173",
    suiMode: "local",
    suiNetwork: "localnet",
    suiRpcUrl: "http://127.0.0.1:9000",
    walrusNetwork: "testnet",
    serverSuiPrivateKeys: [],
    sealMode: "local",
    sealKeyServers: [],
    webSessionSecret: "test-web-session-secret",
    delegateCacheTtlMs: 60_000
  };
  state = {
    registryMode: "local",
    repoObjectId: `local:${owner}/${repo}`,
    repoId: `${owner}/${repo}`,
    owner,
    ownerWallet: auth.walletAddress,
    repo,
    visibility: "public",
    defaultBranch: "refs/heads/main",
    refs: {},
    manifests: [],
    readers: [],
    writers: [],
    createdAtMs: Date.now(),
    updatedAtMs: Date.now()
  };

  barePath = join(config.repoRoot, owner, `${repo}.git`);
  await mkdir(barePath, { recursive: true });
  await git(["init", "--bare", barePath]);

  sourceRepo = join(workspace, "source");
  await git(["init", sourceRepo]);
  await git(["config", "user.email", "test@octopus.local"], sourceRepo);
  await git(["config", "user.name", "Octopus Test"], sourceRepo);
  await commitFile("README.md", "hello\n", "initial commit");
  await git(["branch", "-M", "main"], sourceRepo);
  await git(["checkout", "-b", "feature"], sourceRepo);
  await commitFile("README.md", "hello\nfeature\n", "feature change");
  await git(["push", barePath, "main", "feature"], sourceRepo);
  await git(["checkout", "main"], sourceRepo);
});

afterEach(async () => {
  await rm(workspace, { force: true, recursive: true });
});

const openPullRequest = async () => {
  return await createPullRequest(
    config,
    state,
    { title: "Feature", body: "Adds a feature.", baseRef: "main", headRef: "feature" },
    auth
  );
};

test("loads pre-lifecycle version 1 store files", async () => {
  const storePath = join(config.dataDir, "pull-requests", owner, `${repo}.json`);
  await mkdir(join(config.dataDir, "pull-requests", owner), { recursive: true });
  const legacy = {
    version: 1,
    nextNumber: 2,
    pullRequests: [
      {
        number: 1,
        owner,
        repo,
        repoId: `${owner}/${repo}`,
        title: "Legacy",
        body: "",
        status: "open",
        baseRef: "refs/heads/main",
        headRef: "refs/heads/feature",
        baseCommit: "a".repeat(40),
        headCommit: "b".repeat(40),
        authorAccountId: "local:legacy",
        authorWalletAddress: "0xlegacy",
        createdAtMs: 1,
        updatedAtMs: 1
      }
    ]
  };
  await writeFile(storePath, JSON.stringify(legacy));

  const pullRequests = await listPullRequests(config, owner, repo);
  expect(pullRequests).toHaveLength(1);
  expect(pullRequests[0]).toMatchObject({ number: 1, status: "open", comments: [] });
  const single = await readPullRequest(config, owner, repo, 1);
  expect(single?.comments).toEqual([]);
});

test("close, reopen, and terminal transition guards", async () => {
  const pullRequest = await openPullRequest();

  const closed = await closePullRequest(config, state, pullRequest.number, auth);
  expect(closed.status).toBe("closed");
  expect(closed.closedBy).toBe(auth.walletAddress);
  expect(typeof closed.closedAtMs).toBe("number");
  expect(closed.updatedAtMs).toBeGreaterThanOrEqual(pullRequest.updatedAtMs);

  await expect(closePullRequest(config, state, pullRequest.number, auth)).rejects.toMatchObject({
    statusCode: 405
  });

  const reopened = await reopenPullRequest(config, state, pullRequest.number, auth);
  expect(reopened.status).toBe("open");
  expect(reopened.closedAtMs).toBeUndefined();
  expect(reopened.closedBy).toBeUndefined();

  await expect(reopenPullRequest(config, state, pullRequest.number, auth)).rejects.toMatchObject({
    statusCode: 405
  });
});

test("close and reopen require authentication", async () => {
  const pullRequest = await openPullRequest();
  await expect(closePullRequest(config, state, pullRequest.number, null)).rejects.toMatchObject({
    statusCode: 401
  });
  await closePullRequest(config, state, pullRequest.number, auth);
  await expect(reopenPullRequest(config, state, pullRequest.number, null)).rejects.toMatchObject({
    statusCode: 401
  });
});

test("reopen fails when the head branch is gone", async () => {
  const pullRequest = await openPullRequest();
  await closePullRequest(config, state, pullRequest.number, auth);
  await git(["--git-dir", barePath, "update-ref", "-d", "refs/heads/feature"]);

  await expect(reopenPullRequest(config, state, pullRequest.number, auth)).rejects.toMatchObject({
    statusCode: 409
  });
  const stored = await readPullRequest(config, owner, repo, pullRequest.number);
  expect(stored?.status).toBe("closed");
});

test("comments append in order and bump updatedAtMs", async () => {
  const pullRequest = await openPullRequest();
  await expect(addPullRequestComment(config, state, pullRequest.number, "first", null)).rejects.toMatchObject({
    statusCode: 401
  });
  await expect(addPullRequestComment(config, state, pullRequest.number, "   ", auth)).rejects.toMatchObject({
    statusCode: 400
  });
  await expect(
    addPullRequestComment(config, state, pullRequest.number, "x".repeat(10_001), auth)
  ).rejects.toMatchObject({ statusCode: 400 });

  const first = await addPullRequestComment(config, state, pullRequest.number, "first", auth);
  const second = await addPullRequestComment(config, state, pullRequest.number, "second", auth);
  expect(first.comment.id).toBe(1);
  expect(second.comment.id).toBe(2);
  expect(second.pullRequest.updatedAtMs).toBeGreaterThanOrEqual(pullRequest.updatedAtMs);

  const comments = await listPullRequestComments(config, owner, repo, pullRequest.number);
  expect(comments.map((comment) => comment.body)).toEqual(["first", "second"]);
  expect(comments[0]).toMatchObject({
    authorAccountId: auth.accountId,
    authorWalletAddress: auth.walletAddress
  });

  // Comments stay open on closed PRs.
  await closePullRequest(config, state, pullRequest.number, auth);
  const third = await addPullRequestComment(config, state, pullRequest.number, "after close", auth);
  expect(third.comment.id).toBe(3);
});

test("filters pull requests by status", async () => {
  const pullRequest = await openPullRequest();
  await closePullRequest(config, state, pullRequest.number, auth);

  await git(["checkout", "-b", "feature-2"], sourceRepo);
  await commitFile("OTHER.md", "other\n", "second feature");
  await git(["push", barePath, "feature-2"], sourceRepo);
  await git(["checkout", "main"], sourceRepo);
  await createPullRequest(
    config,
    state,
    { title: "Second", body: "", baseRef: "main", headRef: "feature-2" },
    auth
  );

  expect((await listPullRequests(config, owner, repo, "all")).map((p) => p.number)).toEqual([2, 1]);
  expect((await listPullRequests(config, owner, repo, "open")).map((p) => p.number)).toEqual([2]);
  expect((await listPullRequests(config, owner, repo, "closed")).map((p) => p.number)).toEqual([1]);
  expect(await listPullRequests(config, owner, repo, "merged")).toEqual([]);
});

test("refresh tracks live branches and self-heals merged PRs", async () => {
  const pullRequest = await openPullRequest();

  await git(["checkout", "feature"], sourceRepo);
  const newHead = await commitFile("README.md", "hello\nfeature\nmore\n", "more feature");
  await git(["push", barePath, "feature"], sourceRepo);
  await git(["checkout", "main"], sourceRepo);

  const refreshed = await refreshPullRequest(config, state, pullRequest.number);
  expect(refreshed.headCommit).toBe(newHead);
  expect(refreshed.status).toBe("open");

  // Land the head on the base branch outside the merge endpoint: the PR
  // self-heals to merged on the next refresh.
  await git(["--git-dir", barePath, "update-ref", "refs/heads/main", newHead]);
  const healed = await refreshPullRequest(config, state, pullRequest.number);
  expect(healed.status).toBe("merged");

  // Closed/merged PRs are not refreshed further.
  const stable = await refreshPullRequest(config, state, pullRequest.number);
  expect(stable.status).toBe("merged");
});

test("assesses mergeability and detects conflicts", async () => {
  const pullRequest = await openPullRequest();
  await expect(assessPullRequestMergeability(config, state, pullRequest)).resolves.toEqual({
    mergeable: true
  });

  // Conflicting change on main touching the same line.
  const conflicting = await commitFile("README.md", "hello\nmain conflict\n", "conflicting main change");
  await git(["push", barePath, "main"], sourceRepo);
  expect(conflicting).not.toBe("");

  const result = await assessPullRequestMergeability(config, state, pullRequest);
  expect(result.mergeable).toBe(false);
  expect(result.reason).toContain("conflict");

  await closePullRequest(config, state, pullRequest.number, auth);
  const closedResult = await assessPullRequestMergeability(
    config,
    state,
    (await readPullRequest(config, owner, repo, pullRequest.number))!
  );
  expect(closedResult).toEqual({ mergeable: false, reason: "Pull request is closed" });
});

test("store file keeps a stable shape on disk", async () => {
  const pullRequest = await openPullRequest();
  await addPullRequestComment(config, state, pullRequest.number, "hello", auth);
  const raw = JSON.parse(
    await readFile(join(config.dataDir, "pull-requests", owner, `${repo}.json`), "utf8")
  ) as { version: number; pullRequests: Array<{ comments: unknown[] }> };
  expect(raw.version).toBe(1);
  expect(raw.pullRequests[0]?.comments).toHaveLength(1);
});
