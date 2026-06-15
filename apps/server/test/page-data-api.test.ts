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
import type { ServerConfig } from "../src/config.js";

const execFileAsync = promisify(execFile);

let workspace: string;
let dataDir: string;
let baseUrl: string;
let server: ReturnType<typeof buildServer>;
let delegateKeypair: Ed25519Keypair;
let delegate: { publicKey: string; address: string; accountId: string };
let restAuthHeaders: Record<string, string>;
let gitAuthHeaders: Record<string, string>;

const git = async (args: string[], cwd?: string): Promise<string> => {
  const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: 1024 * 1024 * 10 });
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

const registerDelegate = async (): Promise<void> => {
  const response = await fetch(new URL("/v1/auth/delegate", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      walletAddress: delegate.address,
      accountId: delegate.accountId,
      delegatePublicKey: delegate.publicKey,
      delegateAddress: delegate.address
    })
  });
  expect(response.status).toBe(201);
};

const createWebSessionCookie = async (): Promise<string> => {
  const challengeResponse = await fetch(new URL("/v1/auth/web-session/challenge?returnTo=/", baseUrl));
  expect(challengeResponse.status).toBe(200);
  const challenge = (await challengeResponse.json()) as { nonce: string; message: string };
  const { signature } = await delegateKeypair.signPersonalMessage(Buffer.from(challenge.message, "utf8"));
  const response = await fetch(new URL("/v1/auth/web-session", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      nonce: challenge.nonce,
      walletAddress: delegate.address,
      accountId: delegate.accountId,
      signature
    })
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  expect(cookie).toBeTruthy();
  return cookie ?? "";
};

const createRepo = async (name: string, visibility: "public" | "private"): Promise<void> => {
  const response = await fetch(new URL("/v1/repos", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", ...restAuthHeaders },
    body: JSON.stringify({ name, visibility })
  });
  expect(response.status).toBe(201);
};

const pushInitialCommit = async (repoName: string): Promise<string> => {
  const sourceRepo = join(workspace, `${repoName}-source`);
  const remoteUrl = `${baseUrl}/${delegate.address}/${repoName}.git`;
  await git(["init", sourceRepo]);
  await git(["config", "user.email", "test@octopus.local"], sourceRepo);
  await git(["config", "user.name", "Octopus Test"], sourceRepo);
  await writeFile(join(sourceRepo, "README.md"), "page data api\n");
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
  return git(["rev-parse", "HEAD"], sourceRepo);
};

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "octopus-page-data-"));
  dataDir = join(workspace, "data");
  const config: ServerConfig = {
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
  await removeWorkspace(workspace);
});

test("reports the viewer session as JSON for signed-in and signed-out requests", async () => {
  const signedOut = await fetch(new URL("/v1/auth/web-session", baseUrl));
  expect(signedOut.status).toBe(200);
  expect(signedOut.headers.get("content-type")).toContain("application/json");
  await expect(signedOut.json()).resolves.toEqual({ authenticated: false });

  await registerDelegate();
  const cookie = await createWebSessionCookie();
  const signedIn = await fetch(new URL("/v1/auth/web-session", baseUrl), { headers: { cookie } });
  expect(signedIn.status).toBe(200);
  const body = (await signedIn.json()) as { authenticated: boolean; walletAddress: string };
  expect(body.authenticated).toBe(true);
  expect(body.walletAddress).toBe(delegate.address);
});

test("serves single-repo metadata and commit actors as JSON for a public repo", async () => {
  await registerDelegate();
  await createRepo("page-data-demo", "public");
  const pushedCommit = await pushInitialCommit("page-data-demo");

  const repoResponse = await fetch(new URL(`/v1/repos/${delegate.address}/page-data-demo`, baseUrl));
  expect(repoResponse.status).toBe(200);
  const repoBody = (await repoResponse.json()) as {
    repo: {
      owner: string;
      name: string;
      visibility: string;
      defaultBranch: string;
      defaultBranchCommit: string | null;
      refs: Array<{ shortName: string; isDefault: boolean }>;
      commitCount?: number;
    };
    contentUnlocked: boolean;
  };
  expect(repoBody.contentUnlocked).toBe(true);
  expect(repoBody.repo).toMatchObject({
    owner: delegate.address,
    name: "page-data-demo",
    visibility: "public",
    defaultBranch: "refs/heads/main",
    defaultBranchCommit: pushedCommit,
    commitCount: 1
  });
  expect(repoBody.repo.refs[0]).toMatchObject({ shortName: "main", isDefault: true });

  const actorsResponse = await fetch(new URL(`/v1/repos/${delegate.address}/page-data-demo/commit-actors`, baseUrl));
  expect(actorsResponse.status).toBe(200);
  const actorsBody = (await actorsResponse.json()) as { commitActors: Record<string, string> };
  expect(actorsBody.commitActors).toBeTypeOf("object");

  const missingResponse = await fetch(new URL(`/v1/repos/${delegate.address}/no-such-repo`, baseUrl));
  expect(missingResponse.status).toBe(404);
});

test("returns structured JSON error codes for private repo access", async () => {
  await registerDelegate();
  await createRepo("private-page-data", "private");

  // Anonymous: cannot read the repo at all -> login_required.
  const anonymousRepo = await fetch(new URL(`/v1/repos/${delegate.address}/private-page-data`, baseUrl));
  expect(anonymousRepo.status).toBe(401);
  await expect(anonymousRepo.json()).resolves.toMatchObject({ code: "login_required" });

  const anonymousIndex = await fetch(new URL(`/v1/repos/${delegate.address}/private-page-data/index`, baseUrl));
  expect(anonymousIndex.status).toBe(401);
  await expect(anonymousIndex.json()).resolves.toMatchObject({ code: "login_required" });

  // Signed-in but locked: metadata visible without counts, content endpoints
  // respond 423 repo_locked so the SPA can route to the unlock flow.
  const cookie = await createWebSessionCookie();
  const lockedRepo = await fetch(new URL(`/v1/repos/${delegate.address}/private-page-data`, baseUrl), {
    headers: { cookie }
  });
  expect(lockedRepo.status).toBe(200);
  const lockedRepoBody = (await lockedRepo.json()) as {
    repo: { name: string; visibility: string; commitCount?: number };
    contentUnlocked: boolean;
  };
  expect(lockedRepoBody.contentUnlocked).toBe(false);
  expect(lockedRepoBody.repo).toMatchObject({ name: "private-page-data", visibility: "private" });
  expect(lockedRepoBody.repo.commitCount).toBeUndefined();

  const lockedIndex = await fetch(new URL(`/v1/repos/${delegate.address}/private-page-data/index`, baseUrl), {
    headers: { cookie }
  });
  expect(lockedIndex.status).toBe(423);
  await expect(lockedIndex.json()).resolves.toMatchObject({ code: "repo_locked" });

  const lockedActors = await fetch(
    new URL(`/v1/repos/${delegate.address}/private-page-data/commit-actors`, baseUrl),
    { headers: { cookie } }
  );
  expect(lockedActors.status).toBe(423);
  await expect(lockedActors.json()).resolves.toMatchObject({ code: "repo_locked" });
});
