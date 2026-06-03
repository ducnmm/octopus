import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { delegateAuthHeaders, delegateAuthTokenMessage, type DelegateAuthToken } from "@ducnmm/octopus-shared";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { afterEach, beforeEach, expect, test } from "vitest";
import { buildServer } from "../src/server.js";
import { readSuiRepoState } from "../src/sui.js";
import type { ServerConfig } from "../src/config.js";

const execFileAsync = promisify(execFile);

let workspace: string;
let dataDir: string;
let baseUrl: string;
let server: ReturnType<typeof buildServer>;
let config: ServerConfig;
let delegate: {
  privateKey: string;
  publicKey: string;
  address: string;
  accountId: string;
};
let delegateKeypair: Ed25519Keypair;
let restAuthHeaders: Record<string, string>;
let gitAuthHeaders: Record<string, string>;

const git = async (args: string[], cwd?: string): Promise<string> => {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 1024 * 1024 * 10
  });

  return stdout.trim();
};

const signedDelegateHeaders = async (scope: "rest" | "git"): Promise<Record<string, string>> => {
  const nowMs = Date.now();
  const payload = {
    v: 1 as const,
    accountId: delegate.accountId,
    delegatePublicKey: delegate.publicKey,
    delegateAddress: delegate.address,
    scope,
    issuedAtMs: nowMs,
    expiresAtMs: nowMs + 60 * 60 * 1000
  };
  const { signature } = await delegateKeypair.signPersonalMessage(
    Buffer.from(delegateAuthTokenMessage(payload), "utf8")
  );
  const token: DelegateAuthToken = {
    ...payload,
    signature
  };

  return {
    [delegateAuthHeaders.token]: Buffer.from(JSON.stringify(token), "utf8").toString("base64url")
  };
};

const delegateHeaders = (): Record<string, string> => restAuthHeaders;

const registerDelegate = async (walletAddress = delegate.address): Promise<void> => {
  const registerResponse = await fetch(new URL("/v1/auth/delegate", baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      walletAddress,
      accountId: delegate.accountId,
      delegatePublicKey: delegate.publicKey,
      delegateAddress: delegate.address
    })
  });
  expect(registerResponse.status).toBe(201);
};

const createWebSessionCookie = async (returnTo = "/"): Promise<string> => {
  const challengeResponse = await fetch(new URL(`/v1/auth/web-session/challenge?returnTo=${encodeURIComponent(returnTo)}`, baseUrl));
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
  workspace = await mkdtemp(join(tmpdir(), "octopus-server-"));
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
  restAuthHeaders = await signedDelegateHeaders("rest");
  gitAuthHeaders = await signedDelegateHeaders("git");

  await server.listen({ host: "127.0.0.1", port: 0 });
  const address = server.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not resolve test server address");
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await server.close();
  await rm(workspace, { force: true, recursive: true });
});

test("serves normal git push and clone through smart HTTP", async () => {
  const owner = delegate.address;
  const repoId = `${owner}/demo`;
  const remotePath = `/${owner}/demo.git`;
  const remoteUrl = `${baseUrl}${remotePath}`;
  const emptyRepoListResponse = await fetch(new URL("/v1/repos", baseUrl));
  expect(emptyRepoListResponse.status).toBe(200);
  await expect(emptyRepoListResponse.json()).resolves.toEqual({ repos: [] });

  await registerDelegate();

  const createResponse = await fetch(new URL("/v1/repos", baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...delegateHeaders()
    },
    body: JSON.stringify({
      name: "demo",
      visibility: "public"
    })
  });

  expect(createResponse.status).toBe(201);
  await expect(
    git(["--git-dir", join(dataDir, "repos", owner, "demo.git"), "symbolic-ref", "HEAD"])
  ).resolves.toBe("refs/heads/main");

  const createdRepoListResponse = await fetch(new URL("/v1/repos", baseUrl));
  expect(createdRepoListResponse.status).toBe(200);
  const createdRepoListBody = (await createdRepoListResponse.json()) as {
    repos: Array<{
      owner: string;
      name: string;
      repoId: string;
      visibility: "public" | "private";
      gitRemotePath: string;
      defaultBranchCommit: string | null;
      refCount: number;
      manifestCount: number;
    }>;
  };
  expect(createdRepoListBody.repos).toHaveLength(1);
  expect(createdRepoListBody.repos[0]).toMatchObject({
    owner,
    name: "demo",
    repoId,
    visibility: "public",
    gitRemotePath: remotePath,
    defaultBranchCommit: null,
    refCount: 0,
    manifestCount: 0
  });

  const sourceRepo = join(workspace, "source");
  const cloneRepo = join(workspace, "clone");
  const restoredCloneRepo = join(workspace, "restored-clone");
  await git(["init", sourceRepo]);
  await git(["config", "user.email", "test@octopus.local"], sourceRepo);
  await git(["config", "user.name", "Octopus Test"], sourceRepo);
  await writeFile(join(sourceRepo, "README.md"), "hello octopus\n");
  await git(["add", "README.md"], sourceRepo);
  await git(["commit", "-m", "initial commit"], sourceRepo);
  await git(["branch", "-M", "main"], sourceRepo);
  await git(["remote", "add", "origin", remoteUrl], sourceRepo);
  await git([
    "config",
    "--local",
    "--add",
    `http.${remoteUrl}.extraHeader`,
    `${delegateAuthHeaders.token}: ${gitAuthHeaders[delegateAuthHeaders.token]}`
  ], sourceRepo);
  await git(["push", "origin", "main"], sourceRepo);

  await git(["clone", remoteUrl, cloneRepo]);

  const pushedCommit = await git(["rev-parse", "HEAD"], sourceRepo);
  const clonedCommit = await git(["rev-parse", "HEAD"], cloneRepo);
  expect(clonedCommit).toBe(pushedCommit);

  const manifestResponse = await fetch(new URL(`/v1/repos/${owner}/demo/manifests`, baseUrl));
  expect(manifestResponse.status).toBe(200);
  const manifestBody = (await manifestResponse.json()) as {
    manifests: Array<{
      refName: string;
      oldCommit: string | null;
      newCommit: string;
      walrusBlobId: string;
      artifactDigest: string;
      artifactPath: string;
      actorWalletAddress?: string;
      storageMode: "local" | "walrus-cli" | "walrus-relay";
      isSnapshot: boolean;
      seq: number;
    }>;
  };
  expect(manifestBody.manifests).toHaveLength(1);

  const manifest = manifestBody.manifests[0];
  expect(manifest).toMatchObject({
    refName: "refs/heads/main",
    oldCommit: null,
    newCommit: pushedCommit,
    actorWalletAddress: delegate.address,
    storageMode: "local",
    isSnapshot: true,
    seq: 1
  });
  expect(manifest?.walrusBlobId).toBe(`local:${manifest?.artifactDigest}`);

  const pushedRepoListResponse = await fetch(new URL("/v1/repos", baseUrl));
  expect(pushedRepoListResponse.status).toBe(200);
  const pushedRepoListBody = (await pushedRepoListResponse.json()) as {
    repos: Array<{
      repoId: string;
      defaultBranchCommit: string | null;
      refCount: number;
      manifestCount: number;
    }>;
  };
  expect(pushedRepoListBody.repos[0]).toMatchObject({
    repoId,
    defaultBranchCommit: pushedCommit,
    refCount: 1,
    manifestCount: 1
  });

  const webResponse = await fetch(new URL("/", baseUrl));
  expect(webResponse.status).toBe(200);
  expect(webResponse.headers.get("content-type")).toContain("text/html");
  const webBody = await webResponse.text();
  expect(webBody).toContain("Home");
  expect(webBody).toContain(repoId);
  expect(webBody).toContain("1 commit");

  const profileResponse = await fetch(new URL(`/${owner}`, baseUrl));
  expect(profileResponse.status).toBe(200);
  const profileBody = await profileResponse.text();
  expect(profileBody).toContain("Contribution activity");
  expect(profileBody).toContain("Created 1 commit in 1 repository");

  const indexResponse = await fetch(new URL(`/v1/repos/${owner}/demo/index`, baseUrl));
  expect(indexResponse.status).toBe(200);
  const indexBody = (await indexResponse.json()) as {
    index: {
      repoId: string;
      headCommit: string;
      commitCount: number;
      treeEntryCount: number;
      treeEntries: Array<{ path: string; type: string }>;
    };
  };
  expect(indexBody.index).toMatchObject({
    repoId,
    headCommit: pushedCommit,
    commitCount: 1,
    treeEntryCount: 1
  });
  expect(indexBody.index.treeEntries[0]).toMatchObject({
    path: "README.md",
    type: "blob"
  });

  const commitsResponse = await fetch(new URL(`/v1/repos/${owner}/demo/commits`, baseUrl));
  expect(commitsResponse.status).toBe(200);
  const commitsBody = (await commitsResponse.json()) as {
    commits: Array<{ oid: string; subject: string }>;
  };
  expect(commitsBody.commits[0]).toMatchObject({
    oid: pushedCommit,
    subject: "initial commit"
  });

  const treeResponse = await fetch(new URL(`/v1/repos/${owner}/demo/tree`, baseUrl));
  expect(treeResponse.status).toBe(200);
  const treeBody = (await treeResponse.json()) as {
    entries: Array<{ path: string; type: string; size: number }>;
  };
  expect(treeBody.entries[0]).toMatchObject({
    path: "README.md",
    type: "blob",
    size: "hello octopus\n".length
  });

  const blobResponse = await fetch(new URL(`/v1/repos/${owner}/demo/blob?path=README.md`, baseUrl));
  expect(blobResponse.status).toBe(200);
  const blobBody = (await blobResponse.json()) as {
    file: { path: string; encoding: string; content: string };
  };
  expect(blobBody.file).toMatchObject({
    path: "README.md",
    encoding: "utf8",
    content: "hello octopus\n"
  });

  const repoPageResponse = await fetch(new URL(`/${owner}/demo`, baseUrl));
  expect(repoPageResponse.status).toBe(200);
  const repoPage = await repoPageResponse.text();
  const shortOwner = `${owner.slice(0, 6)}...${owner.slice(-4)}`;
  expect(repoPage).toContain("README.md");
  expect(repoPage).toContain("1 commits");
  expect(repoPage).toContain(shortOwner);
  expect(repoPage).not.toContain("Octopus Test</strong>");
  expect(repoPage).toContain("entry-icon file");
  expect(repoPage).toContain("Copy clone command");
  expect(repoPage).toContain(`data-copy-text="git clone ${baseUrl}/${owner}/demo.git"`);
  expect(repoPage).toContain("<h2>About</h2>");
  expect(repoPage).toContain("No description, website, or topics provided.");
  expect(repoPage).toContain("readme-panel");
  expect(repoPage).toContain("hello octopus");

  const filePageResponse = await fetch(new URL(`/${owner}/demo/blob?path=README.md`, baseUrl));
  expect(filePageResponse.status).toBe(200);
  await expect(filePageResponse.text()).resolves.toContain("hello octopus");

  const suiState = await readSuiRepoState(
    config,
    owner,
    "demo"
  );
  expect(suiState?.registryMode).toBe("local");
  expect(suiState?.refs["refs/heads/main"]).toMatchObject({
    commitDigest: pushedCommit,
    manifestId: manifest?.manifestId,
    seq: 1
  });
  expect(suiState?.manifests).toHaveLength(1);

  const artifact = await readFile(manifest!.artifactPath);
  const artifactDigest = createHash("sha256").update(artifact).digest("hex");
  expect(artifactDigest).toBe(manifest?.artifactDigest);
  await expect(stat(join(dataDir, "walrus", "blobs", `${manifest?.artifactDigest}.bundle`))).resolves.toBeTruthy();
  await git(["bundle", "verify", manifest!.artifactPath], sourceRepo);

  await rm(join(dataDir, "repos", owner, "demo.git"), { force: true, recursive: true });

  const unauthorizedPublicRestore = await fetch(new URL(`/v1/repos/${owner}/demo/restore`, baseUrl), {
    method: "POST"
  });
  expect(unauthorizedPublicRestore.status).toBe(401);

  const restoreResponse = await fetch(new URL(`/v1/repos/${owner}/demo/restore`, baseUrl), {
    method: "POST",
    headers: delegateHeaders()
  });
  expect(restoreResponse.status).toBe(200);
  const restoreBody = (await restoreResponse.json()) as {
    manifestId: string;
    restoredCommit: string;
    artifactDigest: string;
    storageMode: "local" | "walrus-cli" | "walrus-relay";
    manifestSource: "sui-local" | "artifact-fallback";
  };
  expect(restoreBody).toMatchObject({
    manifestId: manifest?.manifestId,
    restoredCommit: pushedCommit,
    artifactDigest: manifest?.artifactDigest,
    storageMode: "local",
    manifestSource: "sui-local"
  });

  await git(["clone", remoteUrl, restoredCloneRepo]);
  const restoredClonedCommit = await git(["rev-parse", "HEAD"], restoredCloneRepo);
  expect(restoredClonedCommit).toBe(pushedCommit);
});

test("opens pull requests from pushed branches", async () => {
  const owner = delegate.address;
  const remoteUrl = `${baseUrl}/${owner}/pr-demo.git`;
  await registerDelegate();
  const createResponse = await fetch(new URL("/v1/repos", baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...delegateHeaders()
    },
    body: JSON.stringify({
      name: "pr-demo",
      visibility: "public"
    })
  });
  expect(createResponse.status).toBe(201);

  const sourceRepo = join(workspace, "pr-source");
  await git(["init", sourceRepo]);
  await git(["config", "user.email", "test@octopus.local"], sourceRepo);
  await git(["config", "user.name", "Octopus Test"], sourceRepo);
  await writeFile(join(sourceRepo, "README.md"), "hello octopus\n");
  await git(["add", "README.md"], sourceRepo);
  await git(["commit", "-m", "initial commit"], sourceRepo);
  await git(["branch", "-M", "main"], sourceRepo);
  await git(["remote", "add", "origin", remoteUrl], sourceRepo);
  await git([
    "config",
    "--local",
    "--add",
    `http.${remoteUrl}.extraHeader`,
    `${delegateAuthHeaders.token}: ${gitAuthHeaders[delegateAuthHeaders.token]}`
  ], sourceRepo);
  await git(["push", "origin", "main"], sourceRepo);

  await git(["checkout", "-b", "feature/readme"], sourceRepo);
  await writeFile(join(sourceRepo, "README.md"), "hello octopus\nfrom a pull request\n");
  await git(["add", "README.md"], sourceRepo);
  await git(["commit", "-m", "update readme"], sourceRepo);
  await git(["push", "origin", "feature/readme"], sourceRepo);
  const featureCommit = await git(["rev-parse", "HEAD"], sourceRepo);

  const pullResponse = await fetch(new URL(`/v1/repos/${owner}/pr-demo/pulls`, baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...delegateHeaders()
    },
    body: JSON.stringify({
      title: "Update README",
      body: "Adds a second line.",
      baseRef: "main",
      headRef: "feature/readme"
    })
  });
  expect(pullResponse.status).toBe(201);
  const pullBody = (await pullResponse.json()) as {
    pullRequest: {
      number: number;
      title: string;
      status: "open";
      baseRef: string;
      headRef: string;
      headCommit: string;
    };
  };
  expect(pullBody.pullRequest).toMatchObject({
    number: 1,
    title: "Update README",
    status: "open",
    baseRef: "refs/heads/main",
    headRef: "refs/heads/feature/readme",
    headCommit: featureCommit
  });

  const pullListResponse = await fetch(new URL(`/v1/repos/${owner}/pr-demo/pulls`, baseUrl));
  expect(pullListResponse.status).toBe(200);
  const pullListBody = (await pullListResponse.json()) as {
    pullRequests: Array<{ number: number; title: string }>;
  };
  expect(pullListBody.pullRequests).toEqual([
    expect.objectContaining({
      number: 1,
      title: "Update README"
    })
  ]);

  const pullDetailResponse = await fetch(new URL(`/v1/repos/${owner}/pr-demo/pulls/1`, baseUrl));
  expect(pullDetailResponse.status).toBe(200);
  const pullDetailBody = (await pullDetailResponse.json()) as {
    comparison: {
      commitCount: number;
      fileCount: number;
      additions: number;
      deletions: number;
      commits: Array<{ oid: string; subject: string }>;
      files: Array<{ path: string; additions: number }>;
      patch: string;
    };
  };
  expect(pullDetailBody.comparison).toMatchObject({
    commitCount: 1,
    fileCount: 1
  });
  expect(pullDetailBody.comparison.commits[0]).toMatchObject({
    oid: featureCommit,
    subject: "update readme"
  });
  expect(pullDetailBody.comparison.files[0]).toMatchObject({
    path: "README.md",
    additions: 1
  });
  expect(pullDetailBody.comparison.patch).toContain("from a pull request");

  const pullListPageResponse = await fetch(new URL(`/${owner}/pr-demo/pulls`, baseUrl));
  expect(pullListPageResponse.status).toBe(200);
  const pullListPage = await pullListPageResponse.text();
  expect(pullListPage).toContain("Pull requests");
  expect(pullListPage).toContain("Update README");
  expect(pullListPage).not.toContain("Open pull request");

  const webSessionCookie = await createWebSessionCookie(`/${owner}/pr-demo/pulls`);
  const signedPullListPageResponse = await fetch(new URL(`/${owner}/pr-demo/pulls`, baseUrl), {
    headers: { cookie: webSessionCookie }
  });
  expect(signedPullListPageResponse.status).toBe(200);
  const signedPullListPage = await signedPullListPageResponse.text();
  expect(signedPullListPage).toContain("New pull request");
  expect(signedPullListPage).toContain(`href="/${owner}/pr-demo/pulls/new"`);
  expect(signedPullListPage).not.toContain("Open pull request");

  const pullCreatePageResponse = await fetch(new URL(`/${owner}/pr-demo/pulls/new`, baseUrl), {
    headers: { cookie: webSessionCookie }
  });
  expect(pullCreatePageResponse.status).toBe(200);
  const pullCreatePage = await pullCreatePageResponse.text();
  expect(pullCreatePage).toContain("Open pull request");
  expect(pullCreatePage).toContain("feature/readme");
  expect(pullCreatePage).toContain(`action="/${owner}/pr-demo/pulls"`);

  const pullDetailPageResponse = await fetch(new URL(`/${owner}/pr-demo/pulls/1`, baseUrl));
  expect(pullDetailPageResponse.status).toBe(200);
  const pullDetailPage = await pullDetailPageResponse.text();
  const shortOwner = `${owner.slice(0, 6)}...${owner.slice(-4)}`;
  expect(pullDetailPage).toContain("Adds a second line.");
  expect(pullDetailPage).toContain("feature/readme");
  expect(pullDetailPage).toContain("README.md");
  expect(pullDetailPage).toContain(shortOwner);
  expect(pullDetailPage).not.toContain(">Octopus Test</td>");
  expect(pullDetailPage).not.toContain("diff --git");

  const duplicateResponse = await fetch(new URL(`/v1/repos/${owner}/pr-demo/pulls`, baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...delegateHeaders()
    },
    body: JSON.stringify({
      title: "Duplicate",
      baseRef: "main",
      headRef: "feature/readme"
    })
  });
  expect(duplicateResponse.status).toBe(409);
});

test("requires delegate headers for push and private fetch", async () => {
  const owner = delegate.address;
  const repoId = `${owner}/private-demo`;
  const remotePath = `/${owner}/private-demo.git`;
  await registerDelegate();
  const createResponse = await fetch(new URL("/v1/repos", baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...delegateHeaders()
    },
    body: JSON.stringify({
      name: "private-demo",
      visibility: "private"
    })
  });
  expect(createResponse.status).toBe(201);

  const anonymousRepoList = await fetch(new URL("/v1/repos", baseUrl));
  expect(anonymousRepoList.status).toBe(200);
  await expect(anonymousRepoList.json()).resolves.toEqual({ repos: [] });

  const anonymousPrivatePage = await fetch(new URL(`/${owner}/private-demo`, baseUrl));
  expect(anonymousPrivatePage.status).toBe(401);
  await expect(anonymousPrivatePage.text()).resolves.toContain("Sign in with your Sui wallet");

  const anonymousPrivatePulls = await fetch(new URL(`/v1/repos/${owner}/private-demo/pulls`, baseUrl));
  expect(anonymousPrivatePulls.status).toBe(401);

  const challengeResponse = await fetch(new URL("/v1/auth/web-session/challenge?returnTo=/", baseUrl));
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
  let webSessionCookie = webSessionResponse.headers.get("set-cookie")?.split(";")[0];
  expect(webSessionCookie).toBeTruthy();

  const webSessionRepoList = await fetch(new URL("/v1/repos", baseUrl), {
    headers: { cookie: webSessionCookie ?? "" }
  });
  expect(webSessionRepoList.status).toBe(200);
  const webSessionRepoListBody = (await webSessionRepoList.json()) as {
    repos: Array<{ repoId: string; visibility: "public" | "private" }>;
  };
  expect(webSessionRepoListBody.repos).toHaveLength(1);
  expect(webSessionRepoListBody.repos[0]).toMatchObject({
    repoId,
    visibility: "private"
  });

  const lockedIndexResponse = await fetch(new URL(`/v1/repos/${owner}/private-demo/index`, baseUrl), {
    headers: { cookie: webSessionCookie ?? "" }
  });
  expect(lockedIndexResponse.status).toBe(423);

  const lockedPullsResponse = await fetch(new URL(`/v1/repos/${owner}/private-demo/pulls`, baseUrl), {
    headers: { cookie: webSessionCookie ?? "" }
  });
  expect(lockedPullsResponse.status).toBe(423);

  const lockedPrivatePage = await fetch(new URL(`/${owner}/private-demo`, baseUrl), {
    headers: { cookie: webSessionCookie ?? "" }
  });
  expect(lockedPrivatePage.status).toBe(423);
  await expect(lockedPrivatePage.text()).resolves.toContain("Unlock repository");

  const unlockChallengeResponse = await fetch(
    new URL(`/v1/repos/${owner}/private-demo/unlock/challenge?returnTo=/${owner}/private-demo`, baseUrl),
    { headers: { cookie: webSessionCookie ?? "" } }
  );
  expect(unlockChallengeResponse.status).toBe(200);
  const unlockChallenge = (await unlockChallengeResponse.json()) as { nonce: string; message: string };
  const unlockSignature = await delegateKeypair.signPersonalMessage(Buffer.from(unlockChallenge.message, "utf8"));
  const unlockResponse = await fetch(new URL(`/v1/repos/${owner}/private-demo/unlock`, baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: webSessionCookie ?? ""
    },
    body: JSON.stringify({
      nonce: unlockChallenge.nonce,
      signature: unlockSignature.signature
    })
  });
  expect(unlockResponse.status).toBe(200);
  webSessionCookie = unlockResponse.headers.get("set-cookie")?.split(";")[0] ?? webSessionCookie;

  const unlockedIndexResponse = await fetch(new URL(`/v1/repos/${owner}/private-demo/index`, baseUrl), {
    headers: { cookie: webSessionCookie ?? "" }
  });
  expect(unlockedIndexResponse.status).toBe(200);

  const unlockedPullsResponse = await fetch(new URL(`/v1/repos/${owner}/private-demo/pulls`, baseUrl), {
    headers: { cookie: webSessionCookie ?? "" }
  });
  expect(unlockedPullsResponse.status).toBe(200);
  await expect(unlockedPullsResponse.json()).resolves.toEqual({ pullRequests: [] });

  const contributorWallet = Ed25519Keypair.generate().getPublicKey().toSuiAddress();
  const accessPageResponse = await fetch(new URL(`/${owner}/private-demo/settings/access`, baseUrl), {
    headers: { cookie: webSessionCookie ?? "" }
  });
  expect(accessPageResponse.status).toBe(200);
  const accessPage = await accessPageResponse.text();
  expect(accessPage).toContain("Contributors");
  expect(accessPage).toContain("0x wallet address");
  expect(accessPage).toContain(`action="/${owner}/private-demo/contributors"`);

  const addContributorResponse = await fetch(new URL(`/${owner}/private-demo/contributors`, baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...delegateHeaders()
    },
    body: new URLSearchParams({
      action: "add",
      role: "writer",
      walletAddress: contributorWallet,
      returnTo: `/${owner}/private-demo/settings/access`
    }).toString()
  });
  expect(addContributorResponse.status).toBe(303);
  expect(addContributorResponse.headers.get("location")).toBe(`/${owner}/private-demo/settings/access`);
  const contributorState = await readSuiRepoState(config, owner, "private-demo");
  expect(contributorState?.writers).toContain(contributorWallet.toLowerCase());

  const contributorPageResponse = await fetch(new URL(`/${owner}/private-demo`, baseUrl), {
    headers: { cookie: webSessionCookie ?? "" }
  });
  expect(contributorPageResponse.status).toBe(200);
  const contributorPage = await contributorPageResponse.text();
  expect(contributorPage).toContain("Settings");
  expect(contributorPage).toContain(`href="/${owner}/private-demo/settings/access"`);
  expect(contributorPage).not.toContain("0x wallet address");

  const updatedAccessPageResponse = await fetch(new URL(`/${owner}/private-demo/settings/access`, baseUrl), {
    headers: { cookie: webSessionCookie ?? "" }
  });
  expect(updatedAccessPageResponse.status).toBe(200);
  const updatedAccessPage = await updatedAccessPageResponse.text();
  expect(updatedAccessPage).toContain(contributorWallet.slice(0, 6));

  const authorizedRepoList = await fetch(new URL("/v1/repos", baseUrl), {
    headers: delegateHeaders()
  });
  expect(authorizedRepoList.status).toBe(200);
  const authorizedRepoListBody = (await authorizedRepoList.json()) as {
    repos: Array<{ repoId: string; visibility: "public" | "private" }>;
  };
  expect(authorizedRepoListBody.repos).toHaveLength(1);
  expect(authorizedRepoListBody.repos[0]).toMatchObject({
    repoId,
    visibility: "private"
  });

  const pushAdvertisement = await fetch(
    new URL(`${remotePath}/info/refs?service=git-receive-pack`, baseUrl)
  );
  expect(pushAdvertisement.status).toBe(401);

  const privateFetchAdvertisement = await fetch(
    new URL(`${remotePath}/info/refs?service=git-upload-pack`, baseUrl)
  );
  expect(privateFetchAdvertisement.status).toBe(401);

  const authorizedFetchAdvertisement = await fetch(
    new URL(`${remotePath}/info/refs?service=git-upload-pack`, baseUrl),
    { headers: gitAuthHeaders }
  );
  expect(authorizedFetchAdvertisement.status).toBe(200);
});

test("rejects repo owners that do not belong to the authenticated wallet", async () => {
  await registerDelegate();
  const otherWallet = Ed25519Keypair.generate().getPublicKey().toSuiAddress();

  const wrongAddressResponse = await fetch(new URL("/v1/repos", baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...delegateHeaders()
    },
    body: JSON.stringify({
      owner: otherWallet,
      name: "demo",
      visibility: "public"
    })
  });
  expect(wrongAddressResponse.status).toBe(403);

  const arbitraryOwnerResponse = await fetch(new URL("/v1/repos", baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...delegateHeaders()
    },
    body: JSON.stringify({
      owner: "ducnmm",
      name: "demo",
      visibility: "public"
    })
  });
  expect(arbitraryOwnerResponse.status).toBe(400);
});

test("only allows configured browser origins to use credentialed CORS", async () => {
  const allowedPreflight = await fetch(new URL("/v1/repos", baseUrl), {
    method: "OPTIONS",
    headers: {
      origin: "http://127.0.0.1:45173",
      "access-control-request-method": "POST"
    }
  });
  expect(allowedPreflight.status).toBe(204);
  expect(allowedPreflight.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:45173");
  expect(allowedPreflight.headers.get("access-control-allow-credentials")).toBe("true");

  const disallowedPreflight = await fetch(new URL("/v1/repos", baseUrl), {
    method: "OPTIONS",
    headers: {
      origin: "https://evil.example",
      "access-control-request-method": "POST"
    }
  });
  expect(disallowedPreflight.status).toBe(403);
  expect(disallowedPreflight.headers.get("access-control-allow-origin")).toBeNull();
});

test("accepts browser form logout posts and clears the web session cookie", async () => {
  const challengeResponse = await fetch(new URL("/v1/auth/web-session/challenge?returnTo=/", baseUrl));
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
  const webSessionCookie = webSessionResponse.headers.get("set-cookie")?.split(";")[0];
  expect(webSessionCookie).toBeTruthy();

  const logoutResponse = await fetch(new URL("/logout", baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: webSessionCookie ?? "",
      referer: `${baseUrl}/`
    },
    body: ""
  });

  expect(logoutResponse.status).toBe(303);
  expect(logoutResponse.headers.get("location")).toBe("/");
  expect(logoutResponse.headers.get("set-cookie")).toContain("Max-Age=0");
});

test("fails closed for Git when testnet authorization state is unavailable", async () => {
  config.suiMode = "testnet";
  config.suiNetwork = "testnet";
  config.suiRpcUrl = "http://127.0.0.1:1";
  config.repoRegistryId = "0x0000000000000000000000000000000000000000000000000000000000000001";

  await mkdir(join(dataDir, "repos", "ducnmm"), { recursive: true });
  await git(["init", "--bare", join(dataDir, "repos", "ducnmm", "private-demo.git")]);
  await mkdir(join(dataDir, "sui", "repos", "ducnmm"), { recursive: true });
  await writeFile(
    join(dataDir, "sui", "repos", "ducnmm", "private-demo.json"),
    `${JSON.stringify({
      registryMode: "testnet",
      repoObjectId: "0xrepo",
      repoId: "ducnmm/private-demo",
      owner: "ducnmm",
      ownerWallet: "0xowner",
      repo: "private-demo",
      visibility: "private",
      defaultBranch: "refs/heads/main",
      refs: {},
      manifests: [],
      readers: [],
      writers: [],
      createdAtMs: Date.now(),
      updatedAtMs: Date.now()
    }, null, 2)}\n`
  );

  const privateFetchAdvertisement = await fetch(
    new URL("/ducnmm/private-demo.git/info/refs?service=git-upload-pack", baseUrl)
  );
  expect(privateFetchAdvertisement.status).toBe(503);
});

test("encrypts private push artifacts and requires auth for restore", async () => {
  const owner = delegate.address;
  await registerDelegate();
  const createResponse = await fetch(new URL("/v1/repos", baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...delegateHeaders()
    },
    body: JSON.stringify({
      name: "sealed-demo",
      visibility: "private"
    })
  });
  expect(createResponse.status).toBe(201);

  const sourceRepo = join(workspace, "private-source");
  const restoredCloneRepo = join(workspace, "private-restored-clone");
  const remoteUrl = `${baseUrl}/${owner}/sealed-demo.git`;
  await git(["init", sourceRepo]);
  await git(["config", "user.email", "test@octopus.local"], sourceRepo);
  await git(["config", "user.name", "Octopus Test"], sourceRepo);
  await writeFile(join(sourceRepo, "README.md"), "private octopus\n");
  await git(["add", "README.md"], sourceRepo);
  await git(["commit", "-m", "private commit"], sourceRepo);
  await git(["branch", "-M", "main"], sourceRepo);
  await git(["remote", "add", "origin", remoteUrl], sourceRepo);
  await git([
    "config",
    "--local",
    "--add",
    `http.${remoteUrl}.extraHeader`,
    `${delegateAuthHeaders.token}: ${gitAuthHeaders[delegateAuthHeaders.token]}`
  ], sourceRepo);
  await git(["push", "origin", "main"], sourceRepo);

  const manifestResponse = await fetch(new URL(`/v1/repos/${owner}/sealed-demo/manifests`, baseUrl), {
    headers: delegateHeaders()
  });
  expect(manifestResponse.status).toBe(200);
  const manifestBody = (await manifestResponse.json()) as {
    manifests: Array<{
      artifactDigest: string;
      storedArtifactDigest: string;
      artifactPath: string;
      encrypted: boolean;
      visibility: "public" | "private";
    }>;
  };
  const manifest = manifestBody.manifests[0]!;
  expect(manifest).toMatchObject({
    encrypted: true,
    visibility: "private"
  });
  expect(manifest.storedArtifactDigest).not.toBe(manifest.artifactDigest);
  const storedArtifact = await readFile(manifest.artifactPath);
  expect(createHash("sha256").update(storedArtifact).digest("hex")).toBe(manifest.storedArtifactDigest);

  await rm(join(dataDir, "repos", owner, "sealed-demo.git"), { force: true, recursive: true });
  const unauthorizedRestore = await fetch(new URL(`/v1/repos/${owner}/sealed-demo/restore`, baseUrl), {
    method: "POST"
  });
  expect(unauthorizedRestore.status).toBe(401);

  const restoreResponse = await fetch(new URL(`/v1/repos/${owner}/sealed-demo/restore`, baseUrl), {
    method: "POST",
    headers: delegateHeaders()
  });
  expect(restoreResponse.status).toBe(200);
  await expect(
    git(["--git-dir", join(dataDir, "repos", owner, "sealed-demo.git"), "symbolic-ref", "HEAD"])
  ).resolves.toBe("refs/heads/main");

  await git([
    "-c",
    `http.${remoteUrl}.extraHeader=${delegateAuthHeaders.token}: ${gitAuthHeaders[delegateAuthHeaders.token]}`,
    "clone",
    remoteUrl,
    restoredCloneRepo
  ]);
  const pushedCommit = await git(["rev-parse", "HEAD"], sourceRepo);
  const restoredClonedCommit = await git(["rev-parse", "HEAD"], restoredCloneRepo);
  expect(restoredClonedCommit).toBe(pushedCommit);
});
