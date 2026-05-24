import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { delegateAuthHeaders, delegateAuthTokenMessage, type DelegateAuthToken } from "@octopus/shared";
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

const registerDelegate = async (walletAddress = "ducnmm"): Promise<void> => {
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

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "octopus-server-"));
  dataDir = join(workspace, "data");
  config = {
    host: "127.0.0.1",
    port: 0,
    dataDir,
    repoRoot: join(dataDir, "repos"),
    suiMode: "local",
    suiNetwork: "localnet",
    suiRpcUrl: "http://127.0.0.1:9000",
    walrusNetwork: "testnet",
    serverSuiPrivateKeys: [],
    sealMode: "local",
    sealKeyServers: [],
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
      owner: "ducnmm",
      name: "demo",
      visibility: "public"
    })
  });

  expect(createResponse.status).toBe(201);

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
    owner: "ducnmm",
    name: "demo",
    repoId: "ducnmm/demo",
    visibility: "public",
    gitRemotePath: "/ducnmm/demo.git",
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
  await git(["remote", "add", "origin", `${baseUrl}/ducnmm/demo.git`], sourceRepo);
  await git([
    "config",
    "--local",
    "--add",
    `http.${baseUrl}/ducnmm/demo.git.extraHeader`,
    `${delegateAuthHeaders.token}: ${gitAuthHeaders[delegateAuthHeaders.token]}`
  ], sourceRepo);
  await git(["push", "origin", "main"], sourceRepo);

  await git(["clone", `${baseUrl}/ducnmm/demo.git`, cloneRepo]);

  const pushedCommit = await git(["rev-parse", "HEAD"], sourceRepo);
  const clonedCommit = await git(["rev-parse", "HEAD"], cloneRepo);
  expect(clonedCommit).toBe(pushedCommit);

  const manifestResponse = await fetch(new URL("/v1/repos/ducnmm/demo/manifests", baseUrl));
  expect(manifestResponse.status).toBe(200);
  const manifestBody = (await manifestResponse.json()) as {
    manifests: Array<{
      refName: string;
      oldCommit: string | null;
      newCommit: string;
      walrusBlobId: string;
      artifactDigest: string;
      artifactPath: string;
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
    repoId: "ducnmm/demo",
    defaultBranchCommit: pushedCommit,
    refCount: 1,
    manifestCount: 1
  });

  const webResponse = await fetch(new URL("/", baseUrl));
  expect(webResponse.status).toBe(200);
  expect(webResponse.headers.get("content-type")).toContain("text/html");
  const webBody = await webResponse.text();
  expect(webBody).toContain("Octopus Repositories");
  expect(webBody).toContain("ducnmm/demo");
  expect(webBody).toContain(pushedCommit.slice(0, 12));

  const indexResponse = await fetch(new URL("/v1/repos/ducnmm/demo/index", baseUrl));
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
    repoId: "ducnmm/demo",
    headCommit: pushedCommit,
    commitCount: 1,
    treeEntryCount: 1
  });
  expect(indexBody.index.treeEntries[0]).toMatchObject({
    path: "README.md",
    type: "blob"
  });

  const commitsResponse = await fetch(new URL("/v1/repos/ducnmm/demo/commits", baseUrl));
  expect(commitsResponse.status).toBe(200);
  const commitsBody = (await commitsResponse.json()) as {
    commits: Array<{ oid: string; subject: string }>;
  };
  expect(commitsBody.commits[0]).toMatchObject({
    oid: pushedCommit,
    subject: "initial commit"
  });

  const treeResponse = await fetch(new URL("/v1/repos/ducnmm/demo/tree", baseUrl));
  expect(treeResponse.status).toBe(200);
  const treeBody = (await treeResponse.json()) as {
    entries: Array<{ path: string; type: string; size: number }>;
  };
  expect(treeBody.entries[0]).toMatchObject({
    path: "README.md",
    type: "blob",
    size: "hello octopus\n".length
  });

  const blobResponse = await fetch(new URL("/v1/repos/ducnmm/demo/blob?path=README.md", baseUrl));
  expect(blobResponse.status).toBe(200);
  const blobBody = (await blobResponse.json()) as {
    file: { path: string; encoding: string; content: string };
  };
  expect(blobBody.file).toMatchObject({
    path: "README.md",
    encoding: "utf8",
    content: "hello octopus\n"
  });

  const repoPageResponse = await fetch(new URL("/ducnmm/demo", baseUrl));
  expect(repoPageResponse.status).toBe(200);
  const repoPage = await repoPageResponse.text();
  expect(repoPage).toContain("README.md");
  expect(repoPage).toContain("initial commit");

  const filePageResponse = await fetch(new URL("/ducnmm/demo/blob?path=README.md", baseUrl));
  expect(filePageResponse.status).toBe(200);
  await expect(filePageResponse.text()).resolves.toContain("hello octopus");

  const suiState = await readSuiRepoState(
    config,
    "ducnmm",
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

  await rm(join(dataDir, "repos", "ducnmm", "demo.git"), { force: true, recursive: true });

  const restoreResponse = await fetch(new URL("/v1/repos/ducnmm/demo/restore", baseUrl), {
    method: "POST"
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

  await git(["clone", `${baseUrl}/ducnmm/demo.git`, restoredCloneRepo]);
  const restoredClonedCommit = await git(["rev-parse", "HEAD"], restoredCloneRepo);
  expect(restoredClonedCommit).toBe(pushedCommit);

  await rm(join(dataDir, "repos", "ducnmm", "demo.git"), { force: true, recursive: true });
  const autoRestoredCloneRepo = join(workspace, "auto-restored-clone");
  await git(["clone", `${baseUrl}/ducnmm/demo.git`, autoRestoredCloneRepo]);
  const autoRestoredClonedCommit = await git(["rev-parse", "HEAD"], autoRestoredCloneRepo);
  expect(autoRestoredClonedCommit).toBe(pushedCommit);
});

test("supports common branch and tag ref workflows through smart HTTP", async () => {
  await registerDelegate();
  const createResponse = await fetch(new URL("/v1/repos", baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...delegateHeaders()
    },
    body: JSON.stringify({
      owner: "ducnmm",
      name: "refs-demo",
      visibility: "public"
    })
  });
  expect(createResponse.status).toBe(201);

  const sourceRepo = join(workspace, "refs-source");
  const cloneRepo = join(workspace, "refs-clone");
  const remoteUrl = `${baseUrl}/ducnmm/refs-demo.git`;
  await git(["init", sourceRepo]);
  await git(["config", "user.email", "test@octopus.local"], sourceRepo);
  await git(["config", "user.name", "Octopus Test"], sourceRepo);
  await writeFile(join(sourceRepo, "README.md"), "initial\n");
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
  await writeFile(join(sourceRepo, "README.md"), "initial\npulled\n");
  await git(["add", "README.md"], sourceRepo);
  await git(["commit", "-m", "update main"], sourceRepo);
  await git(["push", "origin", "main"], sourceRepo);
  await git(["pull", "--ff-only"], cloneRepo);
  expect(await git(["rev-parse", "HEAD"], cloneRepo)).toBe(await git(["rev-parse", "HEAD"], sourceRepo));

  await git(["checkout", "-b", "feature"], sourceRepo);
  await writeFile(join(sourceRepo, "feature.txt"), "feature one\n");
  await git(["add", "feature.txt"], sourceRepo);
  await git(["commit", "-m", "feature one"], sourceRepo);
  await git(["push", "origin", "feature"], sourceRepo);
  const firstFeatureCommit = await git(["rev-parse", "HEAD"], sourceRepo);

  await writeFile(join(sourceRepo, "feature.txt"), "feature rewritten\n");
  await git(["add", "feature.txt"], sourceRepo);
  await git(["commit", "--amend", "-m", "feature rewritten"], sourceRepo);
  await git(["push", "--force", "origin", "feature"], sourceRepo);
  const rewrittenFeatureCommit = await git(["rev-parse", "HEAD"], sourceRepo);
  expect(rewrittenFeatureCommit).not.toBe(firstFeatureCommit);

  await git(["tag", "v1"], sourceRepo);
  await git(["push", "origin", "v1"], sourceRepo);
  await git(["push", "origin", ":feature"], sourceRepo);
  await git(["push", "origin", ":refs/tags/v1"], sourceRepo);

  const state = await readSuiRepoState(config, "ducnmm", "refs-demo");
  expect(state?.refs["refs/heads/main"]?.commitDigest).toBe(await git(["rev-parse", "main"], sourceRepo));
  expect(state?.refs["refs/heads/feature"]).toBeUndefined();
  expect(state?.refs["refs/tags/v1"]).toBeUndefined();
});

test("requires delegate headers for push and private fetch", async () => {
  await registerDelegate();
  const createResponse = await fetch(new URL("/v1/repos", baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...delegateHeaders()
    },
    body: JSON.stringify({
      owner: "ducnmm",
      name: "private-demo",
      visibility: "private"
    })
  });
  expect(createResponse.status).toBe(201);

  const anonymousRepoList = await fetch(new URL("/v1/repos", baseUrl));
  expect(anonymousRepoList.status).toBe(200);
  await expect(anonymousRepoList.json()).resolves.toEqual({ repos: [] });

  const authorizedRepoList = await fetch(new URL("/v1/repos", baseUrl), {
    headers: delegateHeaders()
  });
  expect(authorizedRepoList.status).toBe(200);
  const authorizedRepoListBody = (await authorizedRepoList.json()) as {
    repos: Array<{ repoId: string; visibility: "public" | "private" }>;
  };
  expect(authorizedRepoListBody.repos).toHaveLength(1);
  expect(authorizedRepoListBody.repos[0]).toMatchObject({
    repoId: "ducnmm/private-demo",
    visibility: "private"
  });

  const pushAdvertisement = await fetch(
    new URL("/ducnmm/private-demo.git/info/refs?service=git-receive-pack", baseUrl)
  );
  expect(pushAdvertisement.status).toBe(401);

  const privateFetchAdvertisement = await fetch(
    new URL("/ducnmm/private-demo.git/info/refs?service=git-upload-pack", baseUrl)
  );
  expect(privateFetchAdvertisement.status).toBe(401);

  const authorizedFetchAdvertisement = await fetch(
    new URL("/ducnmm/private-demo.git/info/refs?service=git-upload-pack", baseUrl),
    { headers: gitAuthHeaders }
  );
  expect(authorizedFetchAdvertisement.status).toBe(200);
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
  await registerDelegate();
  const createResponse = await fetch(new URL("/v1/repos", baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...delegateHeaders()
    },
    body: JSON.stringify({
      owner: "ducnmm",
      name: "sealed-demo",
      visibility: "private"
    })
  });
  expect(createResponse.status).toBe(201);

  const sourceRepo = join(workspace, "private-source");
  const restoredCloneRepo = join(workspace, "private-restored-clone");
  const remoteUrl = `${baseUrl}/ducnmm/sealed-demo.git`;
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

  const manifestResponse = await fetch(new URL("/v1/repos/ducnmm/sealed-demo/manifests", baseUrl), {
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

  await rm(join(dataDir, "repos", "ducnmm", "sealed-demo.git"), { force: true, recursive: true });
  const unauthorizedRestore = await fetch(new URL("/v1/repos/ducnmm/sealed-demo/restore", baseUrl), {
    method: "POST"
  });
  expect(unauthorizedRestore.status).toBe(401);

  const restoreResponse = await fetch(new URL("/v1/repos/ducnmm/sealed-demo/restore", baseUrl), {
    method: "POST",
    headers: delegateHeaders()
  });
  expect(restoreResponse.status).toBe(200);

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
