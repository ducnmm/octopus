import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { delegateAuthHeaders, delegateAuthTokenMessage, type DelegateAuthToken } from "@ducnmm/octopus-shared";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { afterEach, beforeEach, expect, test } from "vitest";
import { buildServer } from "../src/app.js";
import { readSuiRepoState } from "../src/sui.js";
import type { ServerConfig } from "../src/config.js";

const execFileAsync = promisify(execFile);

let workspace: string;
let dataDir: string;
let baseUrl: string;
let server: ReturnType<typeof buildServer>;
let config: ServerConfig;
let delegateKeypair: Ed25519Keypair;
let delegate: { privateKey: string; publicKey: string; address: string; accountId: string };
let restAuthHeaders: Record<string, string>;
let gitAuthHeaders: Record<string, string>;

const git = async (args: string[], cwd?: string): Promise<string> => {
  const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: 1024 * 1024 * 10 });
  return stdout.trim();
};

const signedHeadersFor = async (
  keypair: Ed25519Keypair,
  accountId: string,
  scope: "rest" | "git"
): Promise<Record<string, string>> => {
  const nowMs = Date.now();
  const payload = {
    v: 1 as const,
    accountId,
    delegatePublicKey: Buffer.from(keypair.getPublicKey().toRawBytes()).toString("hex"),
    delegateAddress: keypair.getPublicKey().toSuiAddress(),
    scope,
    issuedAtMs: nowMs,
    expiresAtMs: nowMs + 60 * 60 * 1000
  };
  const { signature } = await keypair.signPersonalMessage(Buffer.from(delegateAuthTokenMessage(payload), "utf8"));
  const token: DelegateAuthToken = { ...payload, signature };
  return {
    [delegateAuthHeaders.token]: Buffer.from(JSON.stringify(token), "utf8").toString("base64url")
  };
};

const removeWorkspace = async (path: string): Promise<void> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(path, { force: true, recursive: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOTEMPTY" && code !== "EBUSY") {
        throw error;
      }
      await sleep(25 * (attempt + 1));
    }
  }
  await rm(path, { force: true, recursive: true });
};

const registerDelegateFor = async (keypair: Ed25519Keypair, accountId: string, walletAddress: string) => {
  const response = await fetch(new URL("/v1/auth/delegate", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      walletAddress,
      accountId,
      delegatePublicKey: Buffer.from(keypair.getPublicKey().toRawBytes()).toString("hex"),
      delegateAddress: keypair.getPublicKey().toSuiAddress()
    })
  });
  expect(response.status).toBe(201);
};

const createWebSessionCookie = async (returnTo = "/"): Promise<string> => {
  const challengeResponse = await fetch(
    new URL(`/v1/auth/web-session/challenge?returnTo=${encodeURIComponent(returnTo)}`, baseUrl)
  );
  expect(challengeResponse.status).toBe(200);
  const challenge = (await challengeResponse.json()) as { nonce: string; message: string };
  const { signature } = await delegateKeypair.signPersonalMessage(Buffer.from(challenge.message, "utf8"));
  const webSessionResponse = await fetch(new URL("/v1/auth/web-session", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      nonce: challenge.nonce,
      walletAddress: delegate.address,
      accountId: delegate.accountId,
      signature
    })
  });
  expect(webSessionResponse.status).toBe(200);
  const cookie = webSessionResponse.headers.get("set-cookie")?.split(";")[0];
  expect(cookie).toBeTruthy();
  return cookie ?? "";
};

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "octopus-pr-e2e-"));
  dataDir = join(workspace, "data");
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
  server = buildServer(config);

  delegateKeypair = Ed25519Keypair.generate();
  delegate = {
    privateKey: delegateKeypair.getSecretKey(),
    publicKey: Buffer.from(delegateKeypair.getPublicKey().toRawBytes()).toString("hex"),
    address: delegateKeypair.getPublicKey().toSuiAddress(),
    accountId: "local:test-account"
  };
  restAuthHeaders = await signedHeadersFor(delegateKeypair, delegate.accountId, "rest");
  gitAuthHeaders = await signedHeadersFor(delegateKeypair, delegate.accountId, "git");

  await server.listen({ host: "127.0.0.1", port: 0 });
  const address = server.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not resolve test server address");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;

  await registerDelegateFor(delegateKeypair, delegate.accountId, delegate.address);
});

afterEach(async () => {
  await server.close();
  await removeWorkspace(workspace);
});

type SetupResult = {
  sourceRepo: string;
  barePath: string;
  mainCommit: string;
  featureCommit: string;
};

const setupRepoWithFeatureBranch = async (repoName: string): Promise<SetupResult> => {
  const owner = delegate.address;
  const remoteUrl = `${baseUrl}/${owner}/${repoName}.git`;
  const createResponse = await fetch(new URL("/v1/repos", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", ...restAuthHeaders },
    body: JSON.stringify({ name: repoName, visibility: "public" })
  });
  expect(createResponse.status).toBe(201);

  const sourceRepo = join(workspace, `source-${repoName}`);
  await git(["init", sourceRepo]);
  await git(["config", "user.email", "test@octopus.local"], sourceRepo);
  await git(["config", "user.name", "Octopus Test"], sourceRepo);
  await writeFile(join(sourceRepo, "README.md"), "hello octopus\n");
  await git(["add", "README.md"], sourceRepo);
  await git(["commit", "-m", "initial commit"], sourceRepo);
  await git(["branch", "-M", "main"], sourceRepo);
  await git(["remote", "add", "origin", remoteUrl], sourceRepo);
  await git(
    [
      "config",
      "--local",
      "--add",
      `http.${remoteUrl}.extraHeader`,
      `${delegateAuthHeaders.token}: ${gitAuthHeaders[delegateAuthHeaders.token]}`
    ],
    sourceRepo
  );
  await git(["push", "origin", "main"], sourceRepo);
  const mainCommit = await git(["rev-parse", "HEAD"], sourceRepo);

  await git(["checkout", "-b", "feature"], sourceRepo);
  await writeFile(join(sourceRepo, "FEATURE.md"), "feature change\n");
  await git(["add", "FEATURE.md"], sourceRepo);
  await git(["commit", "-m", "feature commit"], sourceRepo);
  await git(["push", "origin", "feature"], sourceRepo);
  const featureCommit = await git(["rev-parse", "HEAD"], sourceRepo);
  await git(["checkout", "main"], sourceRepo);

  return {
    sourceRepo,
    barePath: join(dataDir, "repos", owner, `${repoName}.git`),
    mainCommit,
    featureCommit
  };
};

const openPullRequest = async (repoName: string, headRef = "feature", title = "Add feature"): Promise<number> => {
  const owner = delegate.address;
  const response = await fetch(new URL(`/v1/repos/${owner}/${repoName}/pulls`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", ...restAuthHeaders },
    body: JSON.stringify({ title, body: "Lifecycle test.", baseRef: "main", headRef })
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { pullRequest: { number: number } };
  return body.pullRequest.number;
};

const postJson = async (path: string, body?: unknown, headers: Record<string, string> = restAuthHeaders) => {
  return await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
};

test("REST lifecycle: comment, close, reopen, merge with branch deletion", async () => {
  const owner = delegate.address;
  const { barePath, mainCommit, featureCommit } = await setupRepoWithFeatureBranch("lifecycle");
  const pull = await openPullRequest("lifecycle");

  // Comment.
  const unauthCommentResponse = await fetch(new URL(`/v1/repos/${owner}/lifecycle/pulls/${pull}/comments`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: "anonymous" })
  });
  expect(unauthCommentResponse.status).toBe(401);

  const commentResponse = await postJson(`/v1/repos/${owner}/lifecycle/pulls/${pull}/comments`, { body: "looks good" });
  expect(commentResponse.status).toBe(201);
  const commentsResponse = await fetch(new URL(`/v1/repos/${owner}/lifecycle/pulls/${pull}/comments`, baseUrl));
  expect(commentsResponse.status).toBe(200);
  const commentsBody = (await commentsResponse.json()) as { comments: Array<{ body: string }> };
  expect(commentsBody.comments.map((comment) => comment.body)).toEqual(["looks good"]);

  // Close and reopen.
  const closeResponse = await postJson(`/v1/repos/${owner}/lifecycle/pulls/${pull}/close`);
  expect(closeResponse.status).toBe(200);
  const closedBody = (await closeResponse.json()) as { pullRequest: { status: string; closedBy: string } };
  expect(closedBody.pullRequest).toMatchObject({ status: "closed", closedBy: delegate.address });

  const closedList = (await (
    await fetch(new URL(`/v1/repos/${owner}/lifecycle/pulls?status=closed`, baseUrl))
  ).json()) as { pullRequests: Array<{ number: number }> };
  expect(closedList.pullRequests.map((pullRequest) => pullRequest.number)).toEqual([pull]);
  const openList = (await (
    await fetch(new URL(`/v1/repos/${owner}/lifecycle/pulls?status=open`, baseUrl))
  ).json()) as { pullRequests: unknown[] };
  expect(openList.pullRequests).toEqual([]);

  const reopenResponse = await postJson(`/v1/repos/${owner}/lifecycle/pulls/${pull}/reopen`);
  expect(reopenResponse.status).toBe(200);

  // Detail exposes mergeability for the open PR.
  const detailResponse = await fetch(new URL(`/v1/repos/${owner}/lifecycle/pulls/${pull}`, baseUrl));
  expect(detailResponse.status).toBe(200);
  const detailBody = (await detailResponse.json()) as {
    pullRequest: { headCommit: string };
    mergeability: { mergeable: boolean };
  };
  expect(detailBody.mergeability).toEqual({ mergeable: true });
  expect(detailBody.pullRequest.headCommit).toBe(featureCommit);

  // Merge with a merge commit and delete the head branch.
  const mergeResponse = await postJson(`/v1/repos/${owner}/lifecycle/pulls/${pull}/merge`, {
    strategy: "merge",
    expectedHeadCommit: featureCommit,
    deleteBranch: true
  });
  expect(mergeResponse.status).toBe(200);
  const mergeBody = (await mergeResponse.json()) as {
    pullRequest: { status: string; mergeCommit: string; mergeStrategy: string; mergedBy: string };
    mergeCommit: string;
    branchDeleted: boolean;
  };
  expect(mergeBody.branchDeleted).toBe(true);
  expect(mergeBody.pullRequest).toMatchObject({
    status: "merged",
    mergeCommit: mergeBody.mergeCommit,
    mergeStrategy: "merge",
    mergedBy: delegate.address
  });

  // The bare repo has a two-parent merge commit on main and no feature branch.
  await expect(git(["--git-dir", barePath, "rev-parse", "refs/heads/main"])).resolves.toBe(mergeBody.mergeCommit);
  const parents = await git(["--git-dir", barePath, "rev-list", "--parents", "-n", "1", mergeBody.mergeCommit]);
  expect(parents.split(" ").slice(1).sort()).toEqual([mainCommit, featureCommit].sort());
  await expect(git(["--git-dir", barePath, "rev-parse", "--verify", "refs/heads/feature"])).rejects.toThrow();

  // The merge is anchored like a push: registry state and manifest cover it.
  // (Ref deletions are not anchored — same as push deletions — so the registry
  // still lists the head branch at its last anchored commit.)
  const state = await readSuiRepoState(config, owner, "lifecycle");
  expect(state?.refs["refs/heads/main"]?.commitDigest).toBe(mergeBody.mergeCommit);
  expect(state?.refs["refs/heads/feature"]?.commitDigest).toBe(featureCommit);
  const manifests = (await (
    await fetch(new URL(`/v1/repos/${owner}/lifecycle/manifests`, baseUrl))
  ).json()) as { manifests: Array<{ refName: string; newCommit: string }> };
  expect(manifests.manifests).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ refName: "refs/heads/main", newCommit: mergeBody.mergeCommit })
    ])
  );

  // Merged is terminal: detail still renders (head branch gone), transitions 405.
  const mergedDetail = (await (
    await fetch(new URL(`/v1/repos/${owner}/lifecycle/pulls/${pull}`, baseUrl))
  ).json()) as { pullRequest: { status: string }; comparison: { commitCount: number } };
  expect(mergedDetail.pullRequest.status).toBe("merged");
  expect(mergedDetail.comparison.commitCount).toBe(1);
  expect((await postJson(`/v1/repos/${owner}/lifecycle/pulls/${pull}/merge`, {
    strategy: "merge",
    expectedHeadCommit: featureCommit
  })).status).toBe(405);
  expect((await postJson(`/v1/repos/${owner}/lifecycle/pulls/${pull}/close`)).status).toBe(405);
  expect((await postJson(`/v1/repos/${owner}/lifecycle/pulls/${pull}/reopen`)).status).toBe(405);
});

test("squash and fast-forward merge strategies", async () => {
  const owner = delegate.address;
  const { sourceRepo, barePath, mainCommit, featureCommit } = await setupRepoWithFeatureBranch("strategies");

  // Fast-forward: main has not diverged from feature.
  const ffPull = await openPullRequest("strategies");
  const ffResponse = await postJson(`/v1/repos/${owner}/strategies/pulls/${ffPull}/merge`, {
    strategy: "fast-forward",
    expectedHeadCommit: featureCommit
  });
  expect(ffResponse.status).toBe(200);
  const ffBody = (await ffResponse.json()) as { mergeCommit: string };
  expect(ffBody.mergeCommit).toBe(featureCommit);
  await expect(git(["--git-dir", barePath, "rev-parse", "refs/heads/main"])).resolves.toBe(featureCommit);
  expect(mainCommit).not.toBe(featureCommit);

  // Squash: a new branch with two commits lands as one single-parent commit.
  await git(["pull", "origin", "main"], sourceRepo);
  await git(["checkout", "-b", "squash-me"], sourceRepo);
  await writeFile(join(sourceRepo, "ONE.md"), "one\n");
  await git(["add", "ONE.md"], sourceRepo);
  await git(["commit", "-m", "first squash commit"], sourceRepo);
  await writeFile(join(sourceRepo, "TWO.md"), "two\n");
  await git(["add", "TWO.md"], sourceRepo);
  await git(["commit", "-m", "second squash commit"], sourceRepo);
  await git(["push", "origin", "squash-me"], sourceRepo);
  const squashHead = await git(["rev-parse", "HEAD"], sourceRepo);
  await git(["checkout", "main"], sourceRepo);

  const squashPull = await openPullRequest("strategies", "squash-me", "Squash work");
  const squashResponse = await postJson(`/v1/repos/${owner}/strategies/pulls/${squashPull}/merge`, {
    strategy: "squash",
    expectedHeadCommit: squashHead
  });
  expect(squashResponse.status).toBe(200);
  const squashBody = (await squashResponse.json()) as { mergeCommit: string };

  const parents = await git(["--git-dir", barePath, "rev-list", "--parents", "-n", "1", squashBody.mergeCommit]);
  expect(parents.split(" ")).toEqual([squashBody.mergeCommit, featureCommit]);
  const message = await git(["--git-dir", barePath, "log", "-1", "--format=%s", squashBody.mergeCommit]);
  expect(message).toBe(`Squash work (#${squashPull})`);
  const tree = await git(["--git-dir", barePath, "ls-tree", "--name-only", squashBody.mergeCommit]);
  expect(tree.split("\n").sort()).toEqual(["FEATURE.md", "ONE.md", "README.md", "TWO.md"]);
});

test("keeps the head branch when another open PR targets it as base", async () => {
  const owner = delegate.address;
  const { sourceRepo } = await setupRepoWithFeatureBranch("stacked");

  // stacked branch builds on feature; PR #2 targets feature as its base.
  await git(["checkout", "feature"], sourceRepo);
  await git(["checkout", "-b", "stacked"], sourceRepo);
  await writeFile(join(sourceRepo, "STACKED.md"), "stacked\n");
  await git(["add", "STACKED.md"], sourceRepo);
  await git(["commit", "-m", "stacked commit"], sourceRepo);
  await git(["push", "origin", "stacked"], sourceRepo);
  await git(["checkout", "main"], sourceRepo);

  const basePull = await openPullRequest("stacked");
  const stackedResponse = await fetch(new URL(`/v1/repos/${owner}/stacked/pulls`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", ...restAuthHeaders },
    body: JSON.stringify({ title: "Stacked", baseRef: "feature", headRef: "stacked" })
  });
  expect(stackedResponse.status).toBe(201);
  const stackedPull = ((await stackedResponse.json()) as { pullRequest: { number: number } }).pullRequest.number;

  const detail = (await (
    await fetch(new URL(`/v1/repos/${owner}/stacked/pulls/${basePull}`, baseUrl))
  ).json()) as { pullRequest: { headCommit: string } };
  const mergeResponse = await postJson(`/v1/repos/${owner}/stacked/pulls/${basePull}/merge`, {
    strategy: "merge",
    expectedHeadCommit: detail.pullRequest.headCommit,
    deleteBranch: true
  });
  expect(mergeResponse.status).toBe(200);
  const mergeBody = (await mergeResponse.json()) as {
    pullRequest: { status: string };
    branchDeleted: boolean;
    branchDeleteSkippedReason?: string;
  };
  expect(mergeBody.pullRequest.status).toBe("merged");
  expect(mergeBody.branchDeleted).toBe(false);
  expect(mergeBody.branchDeleteSkippedReason).toContain(`#${stackedPull}`);

  // The dependent PR's base branch still exists.
  const stackedDetail = (await (
    await fetch(new URL(`/v1/repos/${owner}/stacked/pulls/${stackedPull}`, baseUrl))
  ).json()) as { pullRequest: { status: string }; mergeability: { mergeable: boolean } };
  expect(stackedDetail.pullRequest.status).toBe("open");
  expect(stackedDetail.mergeability.mergeable).toBe(true);
});

test("merge rejections: conflict, stale head, diverged fast-forward, non-writer", async () => {
  const owner = delegate.address;
  const { sourceRepo, barePath, featureCommit } = await setupRepoWithFeatureBranch("rejections");
  const pull = await openPullRequest("rejections");

  // Stale head: expectedHeadCommit no longer matches after a head force-move.
  const staleResponse = await postJson(`/v1/repos/${owner}/rejections/pulls/${pull}/merge`, {
    strategy: "merge",
    expectedHeadCommit: "f".repeat(40)
  });
  expect(staleResponse.status).toBe(409);

  // Conflict: main and feature both rewrite README.md.
  await writeFile(join(sourceRepo, "FEATURE.md"), "conflicting main version\n");
  await git(["add", "FEATURE.md"], sourceRepo);
  await git(["commit", "-m", "conflicting main change"], sourceRepo);
  await git(["push", "origin", "main"], sourceRepo);

  const detail = (await (
    await fetch(new URL(`/v1/repos/${owner}/rejections/pulls/${pull}`, baseUrl))
  ).json()) as { mergeability: { mergeable: boolean; reason?: string } };
  expect(detail.mergeability.mergeable).toBe(false);

  const conflictResponse = await postJson(`/v1/repos/${owner}/rejections/pulls/${pull}/merge`, {
    strategy: "merge",
    expectedHeadCommit: featureCommit
  });
  expect(conflictResponse.status).toBe(409);

  // Diverged base blocks fast-forward.
  const ffResponse = await postJson(`/v1/repos/${owner}/rejections/pulls/${pull}/merge`, {
    strategy: "fast-forward",
    expectedHeadCommit: featureCommit
  });
  expect(ffResponse.status).toBe(409);

  // Nothing about the failed merges moved main.
  const mainNow = await git(["--git-dir", barePath, "rev-parse", "refs/heads/main"]);
  expect(mainNow).toBe(await git(["rev-parse", "HEAD"], sourceRepo));

  // A non-writer (not author, not contributor) cannot merge, close, or comment.
  const otherKeypair = Ed25519Keypair.generate();
  const otherAccountId = "local:other-account";
  await registerDelegateFor(otherKeypair, otherAccountId, otherKeypair.getPublicKey().toSuiAddress());
  const otherHeaders = await signedHeadersFor(otherKeypair, otherAccountId, "rest");

  expect(
    (
      await postJson(
        `/v1/repos/${owner}/rejections/pulls/${pull}/merge`,
        { strategy: "merge", expectedHeadCommit: featureCommit },
        otherHeaders
      )
    ).status
  ).toBe(403);
  expect((await postJson(`/v1/repos/${owner}/rejections/pulls/${pull}/close`, undefined, otherHeaders)).status).toBe(
    403
  );
  expect(
    (await postJson(`/v1/repos/${owner}/rejections/pulls/${pull}/comments`, { body: "hi" }, otherHeaders)).status
  ).toBe(403);
});

test("rolls back refs and keeps the PR open when anchoring fails", async () => {
  const owner = delegate.address;
  const { barePath, mainCommit, featureCommit } = await setupRepoWithFeatureBranch("rollback");
  const pull = await openPullRequest("rollback");

  // Sabotage artifact creation: the per-repo manifest directory path is taken
  // by a regular file, so createPushArtifacts fails after the ref update.
  const manifestDir = join(dataDir, "manifests", owner, "rollback");
  await rm(manifestDir, { force: true, recursive: true });
  await writeFile(manifestDir, "not a directory\n");

  const mergeResponse = await postJson(`/v1/repos/${owner}/rollback/pulls/${pull}/merge`, {
    strategy: "merge",
    expectedHeadCommit: featureCommit
  });
  expect(mergeResponse.status).toBeGreaterThanOrEqual(500);

  // Refs rolled back to the anchored state; the PR is still open and mergeable.
  await expect(git(["--git-dir", barePath, "rev-parse", "refs/heads/main"])).resolves.toBe(mainCommit);
  const detail = (await (
    await fetch(new URL(`/v1/repos/${owner}/rollback/pulls/${pull}`, baseUrl))
  ).json()) as { pullRequest: { status: string } };
  expect(detail.pullRequest.status).toBe("open");

  // Remove the blocker and the same merge succeeds.
  await rm(manifestDir, { force: true });
  const retryResponse = await postJson(`/v1/repos/${owner}/rollback/pulls/${pull}/merge`, {
    strategy: "merge",
    expectedHeadCommit: featureCommit
  });
  expect(retryResponse.status).toBe(200);
  const retryBody = (await retryResponse.json()) as { pullRequest: { status: string } };
  expect(retryBody.pullRequest.status).toBe("merged");
});

test("web pages: status badges, gated actions, and comment round-trip", async () => {
  const owner = delegate.address;
  const { featureCommit } = await setupRepoWithFeatureBranch("webui");
  const pull = await openPullRequest("webui");

  // Anonymous viewers see the status badge but no action forms.
  const anonymousDetail = await (await fetch(new URL(`/${owner}/webui/pulls/${pull}`, baseUrl))).text();
  expect(anonymousDetail).toContain("status-open");
  expect(anonymousDetail).not.toContain("Merge pull request");
  expect(anonymousDetail).not.toContain("Close pull request");
  expect(anonymousDetail).not.toContain("Leave a comment");

  // A signed-in writer sees merge, close, and comment controls.
  const cookie = await createWebSessionCookie(`/${owner}/webui/pulls/${pull}`);
  const writerDetail = await (
    await fetch(new URL(`/${owner}/webui/pulls/${pull}`, baseUrl), { headers: { cookie } })
  ).text();
  expect(writerDetail).toContain("Merge pull request");
  expect(writerDetail).toContain("Close pull request");
  expect(writerDetail).toContain("Leave a comment");
  expect(writerDetail).toContain(`name="expectedHeadCommit" value="${featureCommit}"`);

  // Comment form round-trip.
  const commentPost = await fetch(new URL(`/${owner}/webui/pulls/${pull}/comments`, baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ body: "web comment" }).toString()
  });
  expect(commentPost.status).toBe(303);
  expect(commentPost.headers.get("location")).toBe(`/${owner}/webui/pulls/${pull}`);
  const afterComment = await (
    await fetch(new URL(`/${owner}/webui/pulls/${pull}`, baseUrl), { headers: { cookie } })
  ).text();
  expect(afterComment).toContain("web comment");
  expect(afterComment).toContain("1 comment");

  // Close via the web form, then the list page filters by status.
  const closePost = await fetch(new URL(`/${owner}/webui/pulls/${pull}/close`, baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: ""
  });
  expect(closePost.status).toBe(303);

  const openListPage = await (await fetch(new URL(`/${owner}/webui/pulls`, baseUrl))).text();
  expect(openListPage).toContain("No pull requests yet.");
  expect(openListPage).toContain("0 open");
  expect(openListPage).toContain("1 closed");
  const closedListPage = await (
    await fetch(new URL(`/${owner}/webui/pulls?status=closed`, baseUrl))
  ).text();
  expect(closedListPage).toContain("status-closed");
  expect(closedListPage).toContain("Add feature");

  // Reopen control appears on the closed PR for the writer and works.
  const closedDetail = await (
    await fetch(new URL(`/${owner}/webui/pulls/${pull}`, baseUrl), { headers: { cookie } })
  ).text();
  expect(closedDetail).toContain("Reopen pull request");
  const reopenPost = await fetch(new URL(`/${owner}/webui/pulls/${pull}/reopen`, baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: ""
  });
  expect(reopenPost.status).toBe(303);

  // Merge via the web form; failures would land in the error query parameter.
  const mergePost = await fetch(new URL(`/${owner}/webui/pulls/${pull}/merge`, baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      strategy: "merge",
      expectedHeadCommit: featureCommit,
      deleteBranch: "true"
    }).toString()
  });
  expect(mergePost.status).toBe(303);
  expect(mergePost.headers.get("location")).toBe(`/${owner}/webui/pulls/${pull}`);

  const mergedDetail = await (
    await fetch(new URL(`/${owner}/webui/pulls/${pull}`, baseUrl), { headers: { cookie } })
  ).text();
  expect(mergedDetail).toContain("status-merged");
  expect(mergedDetail).toContain("Merged (merge)");
  expect(mergedDetail).not.toContain("Merge pull request</button>");
});
