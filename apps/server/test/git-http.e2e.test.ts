import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, test } from "vitest";
import { buildServer } from "../src/server.js";
import { readSuiRepoState } from "../src/sui.js";

const execFileAsync = promisify(execFile);

let workspace: string;
let dataDir: string;
let baseUrl: string;
let server: ReturnType<typeof buildServer>;

const git = async (args: string[], cwd?: string): Promise<string> => {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 1024 * 1024 * 10
  });

  return stdout.trim();
};

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "octopus-server-"));
  dataDir = join(workspace, "data");
  server = buildServer({
    host: "127.0.0.1",
    port: 0,
    dataDir,
    repoRoot: join(dataDir, "repos"),
    suiMode: "local",
    suiNetwork: "localnet"
  });

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

  const createResponse = await fetch(new URL("/v1/repos", baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json"
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
      storageMode: "local" | "walrus-cli";
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

  const suiState = await readSuiRepoState(
    {
      host: "127.0.0.1",
      port: 0,
      dataDir,
      repoRoot: join(dataDir, "repos"),
      suiMode: "local",
      suiNetwork: "localnet"
    },
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
    storageMode: "local" | "walrus-cli";
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
});
