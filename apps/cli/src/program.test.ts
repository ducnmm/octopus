import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { runCli } from "./program.js";
import type { OctopusFetch } from "./client.js";
import { readCredentials, writeCredentials } from "./credentials.js";
import { generateDelegateIdentity } from "./delegate.js";

const hostedServerUrl = "https://octopus-server.up.railway.app";
const localServerUrl = "http://127.0.0.1:48787";

const execFileAsync = promisify(execFile);

type CapturedOutput = {
  output: () => string;
  stream: {
    write: (chunk: string | Uint8Array) => boolean;
  };
};

const captureOutput = (): CapturedOutput => {
  let value = "";
  return {
    output: () => value,
    stream: {
      write: (chunk) => {
        value += chunk.toString();
        return true;
      }
    }
  };
};

const createContext = (fetchImpl: OctopusFetch = vi.fn() as unknown as OctopusFetch) => {
  const stdout = captureOutput();
  const stderr = captureOutput();

  return {
    context: {
      env: {},
      fetch: fetchImpl,
      home: "/tmp/octopus-home",
      openBrowser: vi.fn(),
      stdout: stdout.stream,
      stderr: stderr.stream
    },
    stderr,
    stdout
  };
};

const waitForMatch = async (read: () => string, pattern: RegExp): Promise<RegExpMatchArray> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    const match = read().match(pattern);
    if (match) {
      return match;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for ${pattern}`);
};

const okJson = (body: unknown, status = 200): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
};

const git = async (cwd: string, ...args: string[]) => {
  return await execFileAsync(
    "git",
    ["-c", "user.email=cli@test", "-c", "user.name=octopus-cli", ...args],
    { cwd }
  );
};

// Minimal static file server: enough for git's dumb-HTTP protocol against a
// bare repo prepared with `git update-server-info`.
const serveDirectory = async (root: string): Promise<{ url: string; close: () => Promise<void> }> => {
  const server = createServer(async (request, response) => {
    try {
      const path = join(root, decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname));
      const info = await stat(path);
      if (!info.isFile()) {
        throw new Error("not a file");
      }
      response.writeHead(200);
      createReadStream(path).pipe(response);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });

  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", () => resolvePromise()));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not start static file server");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolvePromise) => server.close(() => resolvePromise()))
  };
};

const createServedBareRepo = async (tmp: string, owner: string, name: string): Promise<string> => {
  const bare = join(tmp, "root", owner, `${name}.git`);
  const seed = join(tmp, "seed");
  await mkdir(join(tmp, "root", owner), { recursive: true });
  await mkdir(seed, { recursive: true });
  await execFileAsync("git", ["init", "--bare", "-b", "main", bare]);
  await git(seed, "init", "-b", "main");
  await git(seed, "commit", "--allow-empty", "-m", "init");
  await git(seed, "push", bare, "main");
  await execFileAsync("git", ["update-server-info"], { cwd: bare });
  return bare;
};

beforeEach(() => {
  process.exitCode = undefined;
});

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

test("repo create lets the server choose the owner namespace by default", async () => {
  const fetchImpl = vi.fn(async () =>
    okJson({
      owner: "0xabc",
      name: "demo",
      visibility: "public",
      gitRemotePath: "/0xabc/demo.git"
    }, 201)
  ) as unknown as OctopusFetch;
  const { context, stdout } = createContext(fetchImpl);

  await runCli(["repo", "create", "demo"], context);

  expect(fetchImpl).toHaveBeenCalledOnce();
  const [url, init] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
  expect(String(url)).toBe(`${hostedServerUrl}/v1/repos`);
  expect(JSON.parse(String(init?.body))).toEqual({
    name: "demo",
    visibility: "public"
  });
  expect(stdout.output()).toContain("Created 0xabc/demo (public)");
});

test("repo create --dev uses the local server", async () => {
  const fetchImpl = vi.fn(async () =>
    okJson({
      owner: "0xabc",
      name: "demo",
      visibility: "public",
      gitRemotePath: "/0xabc/demo.git"
    }, 201)
  ) as unknown as OctopusFetch;
  const { context, stdout } = createContext(fetchImpl);

  await runCli(["repo", "create", "demo", "--dev"], context);

  const [url] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
  expect(String(url)).toBe(`${localServerUrl}/v1/repos`);
  expect(stdout.output()).toContain(`Remote: ${localServerUrl}/0xabc/demo.git`);
});

test("repo create supports an explicit owner namespace", async () => {
  const fetchImpl = vi.fn(async () =>
    okJson({
      owner: "ducnmm.sui",
      name: "demo",
      visibility: "public",
      gitRemotePath: "/ducnmm.sui/demo.git"
    }, 201)
  ) as unknown as OctopusFetch;
  const { context } = createContext(fetchImpl);

  await runCli(["repo", "create", "demo", "--owner", "ducnmm.sui"], context);

  const [, init] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
  expect(JSON.parse(String(init?.body))).toEqual({
    owner: "ducnmm.sui",
    name: "demo",
    visibility: "public"
  });
});

test("repo create supports explicit private visibility", async () => {
  const fetchImpl = vi.fn(async () =>
    okJson({
      owner: "ducnmm",
      name: "demo",
      visibility: "private",
      gitRemotePath: "/ducnmm/demo.git"
    }, 201)
  ) as unknown as OctopusFetch;
  const { context } = createContext(fetchImpl);

  await runCli(["repo", "create", "demo", "--private"], context);

  const [, init] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
  expect(JSON.parse(String(init?.body))).toEqual({
    name: "demo",
    visibility: "private"
  });
});

test("repo create keeps --private=false compatibility with the spec", async () => {
  const fetchImpl = vi.fn(async () =>
    okJson({
      owner: "ducnmm",
      name: "demo",
      visibility: "public",
      gitRemotePath: "/ducnmm/demo.git"
    }, 201)
  ) as unknown as OctopusFetch;
  const { context } = createContext(fetchImpl);

  await runCli(["repo", "create", "demo", "--private=false"], context);

  const [, init] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
  expect(JSON.parse(String(init?.body))).toEqual({
    name: "demo",
    visibility: "public"
  });
});

test("repo create rejects conflicting visibility flags", async () => {
  const fetchImpl = vi.fn() as unknown as OctopusFetch;
  const { context, stderr } = createContext(fetchImpl);

  await runCli(["repo", "create", "demo", "--public", "--private"], context);

  expect(fetchImpl).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(1);
  expect(stderr.output()).toContain("choose only one of --public or --private");
});

test("repo manifests validates owner/name input before calling the server", async () => {
  const fetchImpl = vi.fn() as unknown as OctopusFetch;
  const { context, stderr } = createContext(fetchImpl);

  await runCli(["repo", "manifests", "demo"], context);

  expect(fetchImpl).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(1);
  expect(stderr.output()).toContain("repo must use owner/name format");
});

test("repo restore calls the restore endpoint and prints the result", async () => {
  const fetchImpl = vi.fn(async () =>
    okJson({
      owner: "ducnmm",
      repo: "demo",
      repoPath: "/tmp/repos/ducnmm/demo.git",
      manifestId: "00000001-heads-main",
      refName: "refs/heads/main",
      restoredCommit: "abc123",
      artifactDigest: "digest",
      storageMode: "local",
      manifestSource: "sui-local"
    })
  ) as unknown as OctopusFetch;
  const { context, stdout } = createContext(fetchImpl);

  await runCli(["repo", "restore", "ducnmm/demo"], context);

  const [url, init] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
  expect(String(url)).toBe(`${hostedServerUrl}/v1/repos/ducnmm/demo/restore`);
  expect(init?.method).toBe("POST");
  expect(stdout.output()).toContain("Restored ducnmm/demo");
  expect(stdout.output()).toContain("source:   sui-local");
});

test("repo restore accepts the legacy -dev alias for local server", async () => {
  const fetchImpl = vi.fn(async () =>
    okJson({
      owner: "ducnmm",
      repo: "demo",
      repoPath: "/tmp/repos/ducnmm/demo.git",
      manifestId: "00000001-heads-main",
      refName: "refs/heads/main",
      restoredCommit: "abc123",
      artifactDigest: "digest",
      storageMode: "local",
      manifestSource: "sui-local"
    })
  ) as unknown as OctopusFetch;
  const { context } = createContext(fetchImpl);

  await runCli(["repo", "restore", "ducnmm/demo", "-dev"], context);

  const [url] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
  expect(String(url)).toBe(`${localServerUrl}/v1/repos/ducnmm/demo/restore`);
});

test("pr create opens a pull request", async () => {
  const fetchImpl = vi.fn(async () =>
    okJson({
      pullRequest: {
        number: 1,
        title: "Add feature",
        baseRef: "refs/heads/main",
        headRef: "refs/heads/feature",
        status: "open"
      }
    }, 201)
  ) as unknown as OctopusFetch;
  const { context, stdout } = createContext(fetchImpl);

  await runCli([
    "pr",
    "create",
    "ducnmm/demo",
    "--base",
    "main",
    "--head",
    "feature",
    "--title",
    "Add feature",
    "--body",
    "Ready for review"
  ], context);

  const [url, init] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
  expect(String(url)).toBe(`${hostedServerUrl}/v1/repos/ducnmm/demo/pulls`);
  expect(init?.method).toBe("POST");
  expect(JSON.parse(String(init?.body))).toEqual({
    title: "Add feature",
    body: "Ready for review",
    baseRef: "main",
    headRef: "feature"
  });
  expect(stdout.output()).toContain("Created pull request #1 ducnmm/demo");
  expect(stdout.output()).toContain("base:  main");
  expect(stdout.output()).toContain("head:  feature");
});

const pullRequestFixture = {
  number: 4,
  title: "Add feature",
  status: "open",
  baseRef: "refs/heads/main",
  headRef: "refs/heads/feature",
  headCommit: "a".repeat(40),
  authorWalletAddress: "0xauthor",
  comments: [{ id: 1 }]
};

const pullRequestDetailFixture = {
  pullRequest: { ...pullRequestFixture, body: "Ready for review" },
  comparison: { commitCount: 2, fileCount: 1, additions: 3, deletions: 1 },
  mergeability: { mergeable: true }
};

test("pr list prints pull requests with a status filter", async () => {
  const fetchImpl = vi.fn(async () => okJson({ pullRequests: [pullRequestFixture] })) as unknown as OctopusFetch;
  const { context, stdout } = createContext(fetchImpl);

  await runCli(["pr", "list", "ducnmm/demo", "--status", "open"], context);

  const [url, init] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
  expect(String(url)).toBe(`${hostedServerUrl}/v1/repos/ducnmm/demo/pulls?status=open`);
  expect(init?.method).toBe("GET");
  expect(stdout.output()).toContain("#4 [open] Add feature (feature -> main)");
});

test("pr list rejects unknown status values", async () => {
  const fetchImpl = vi.fn() as unknown as OctopusFetch;
  const { context, stderr } = createContext(fetchImpl);

  await runCli(["pr", "list", "ducnmm/demo", "--status", "bogus"], context);

  expect(vi.mocked(fetchImpl).mock.calls).toHaveLength(0);
  expect(process.exitCode).toBe(1);
  expect(stderr.output()).toContain("--status expects open, closed, merged, or all");
});

test("pr view prints status, mergeability, and comment count", async () => {
  const fetchImpl = vi.fn(async () => okJson(pullRequestDetailFixture)) as unknown as OctopusFetch;
  const { context, stdout } = createContext(fetchImpl);

  await runCli(["pr", "view", "ducnmm/demo", "4"], context);

  const [url] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
  expect(String(url)).toBe(`${hostedServerUrl}/v1/repos/ducnmm/demo/pulls/4`);
  expect(stdout.output()).toContain("#4 Add feature");
  expect(stdout.output()).toContain("status:   open");
  expect(stdout.output()).toContain("changes:  2 commits, 1 files (+3 -1)");
  expect(stdout.output()).toContain("comments: 1");
  expect(stdout.output()).toContain("mergeable: yes");
});

test("pr merge fetches the head commit before merging", async () => {
  const fetchImpl = vi.fn(async (url: string | URL) => {
    if (String(url).endsWith("/merge")) {
      return okJson({
        pullRequest: { ...pullRequestFixture, status: "merged" },
        mergeCommit: "c".repeat(40),
        branchDeleted: true
      });
    }
    return okJson(pullRequestDetailFixture);
  }) as unknown as OctopusFetch;
  const { context, stdout } = createContext(fetchImpl);

  await runCli(["pr", "merge", "ducnmm/demo", "4", "--strategy", "squash", "--delete-branch"], context);

  const calls = vi.mocked(fetchImpl).mock.calls;
  expect(String(calls[0]?.[0])).toBe(`${hostedServerUrl}/v1/repos/ducnmm/demo/pulls/4`);
  expect(String(calls[1]?.[0])).toBe(`${hostedServerUrl}/v1/repos/ducnmm/demo/pulls/4/merge`);
  expect(JSON.parse(String(calls[1]?.[1]?.body))).toEqual({
    strategy: "squash",
    expectedHeadCommit: "a".repeat(40),
    deleteBranch: true
  });
  expect(stdout.output()).toContain("Merged pull request #4 ducnmm/demo");
  expect(stdout.output()).toContain("strategy: squash");
  expect(stdout.output()).toContain("branch:   deleted feature");
});

test("pr merge rejects unknown strategies", async () => {
  const fetchImpl = vi.fn() as unknown as OctopusFetch;
  const { context, stderr } = createContext(fetchImpl);

  await runCli(["pr", "merge", "ducnmm/demo", "4", "--strategy", "rebase"], context);

  expect(vi.mocked(fetchImpl).mock.calls).toHaveLength(0);
  expect(process.exitCode).toBe(1);
  expect(stderr.output()).toContain("--strategy expects merge, squash, or fast-forward");
});

test("pr close and pr reopen post lifecycle transitions", async () => {
  const fetchImpl = vi.fn(async () => okJson({ pullRequest: pullRequestFixture })) as unknown as OctopusFetch;
  const { context, stdout } = createContext(fetchImpl);

  await runCli(["pr", "close", "ducnmm/demo", "4"], context);
  await runCli(["pr", "reopen", "ducnmm/demo", "4"], context);

  const calls = vi.mocked(fetchImpl).mock.calls;
  expect(String(calls[0]?.[0])).toBe(`${hostedServerUrl}/v1/repos/ducnmm/demo/pulls/4/close`);
  expect(calls[0]?.[1]?.method).toBe("POST");
  expect(String(calls[1]?.[0])).toBe(`${hostedServerUrl}/v1/repos/ducnmm/demo/pulls/4/reopen`);
  expect(stdout.output()).toContain("Closed pull request #4 ducnmm/demo");
  expect(stdout.output()).toContain("Reopened pull request #4 ducnmm/demo");
});

test("pr comment posts the comment body", async () => {
  const fetchImpl = vi.fn(async () =>
    okJson({ comment: { id: 2, createdAtMs: 1700000000000 } }, 201)
  ) as unknown as OctopusFetch;
  const { context, stdout } = createContext(fetchImpl);

  await runCli(["pr", "comment", "ducnmm/demo", "4", "--body", "looks good"], context);

  const [url, init] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
  expect(String(url)).toBe(`${hostedServerUrl}/v1/repos/ducnmm/demo/pulls/4/comments`);
  expect(init?.method).toBe("POST");
  expect(JSON.parse(String(init?.body))).toEqual({ body: "looks good" });
  expect(stdout.output()).toContain("Commented on pull request #4 ducnmm/demo");
});

test("auth login accepts the wallet callback and writes credentials", async () => {
  const home = await mkdtemp(join(tmpdir(), "octopus-cli-home-"));
  const { context, stdout } = createContext();
  context.home = home;

  const run = runCli([
    "auth",
    "login",
    "--no-browser",
    "--server",
    "http://server.test",
    "--web-url",
    "http://web.test",
    "--timeout-ms",
    "5000"
  ], context);

  const [, callbackUrl] = await waitForMatch(
    stdout.output,
    /Waiting for wallet approval at (http:\/\/127\.0\.0\.1:\d+\/callback)/
  );
  const [, openUrl] = await waitForMatch(stdout.output, /Open: (http:\/\/web\.test\/login\?\S+)/);
  const state = new URL(openUrl!).searchParams.get("state");
  expect(state).toMatch(/^[0-9a-f]{32}$/);
  await fetch(callbackUrl!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      walletAddress: "0xabc",
      accountId: "local:abc",
      state,
      packageId: "0xpackage",
      accountRegistryId: "0xaccount-registry",
      repoRegistryId: "0xrepo-registry"
    })
  });
  await run;

  const credentials = await readCredentials(home);
  expect(credentials).toMatchObject({
    walletAddress: "0xabc",
    accountId: "local:abc",
    serverUrl: "http://server.test",
    webUrl: "http://web.test",
    packageId: "0xpackage"
  });
  expect(credentials?.delegatePrivateKey).toBeTruthy();
  expect(stdout.output()).toContain(`Credentials: ${home}/.octopus/credentials.json`);
  await rm(home, { recursive: true, force: true });
});

test("auth login --dev opens the local web login against the local server", async () => {
  const home = await mkdtemp(join(tmpdir(), "octopus-cli-home-"));
  const { context, stdout } = createContext();
  context.home = home;

  const run = runCli([
    "auth",
    "login",
    "--dev",
    "--no-browser",
    "--timeout-ms",
    "5000"
  ], context);

  const [, callbackUrl] = await waitForMatch(
    stdout.output,
    /Waiting for wallet approval at (http:\/\/127\.0\.0\.1:\d+\/callback)/
  );
  const [, openUrl] = await waitForMatch(stdout.output, /Open: (http:\/\/127\.0\.0\.1:45173\/login\?\S+)/);
  const loginUrl = new URL(openUrl!);
  const state = loginUrl.searchParams.get("state");
  expect(loginUrl.searchParams.get("server")).toBe(localServerUrl);
  expect(state).toMatch(/^[0-9a-f]{32}$/);

  await fetch(callbackUrl!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      walletAddress: "0xabc",
      accountId: "local:abc",
      state
    })
  });
  await run;

  const credentials = await readCredentials(home);
  expect(credentials).toMatchObject({
    walletAddress: "0xabc",
    accountId: "local:abc",
    serverUrl: localServerUrl,
    webUrl: "http://127.0.0.1:45173"
  });
  await rm(home, { recursive: true, force: true });
});

test("repo connect writes remote URL and signed delegate token header", async () => {
  const home = await mkdtemp(join(tmpdir(), "octopus-cli-home-"));
  const repoDir = await mkdtemp(join(tmpdir(), "octopus-cli-repo-"));
  const identity = generateDelegateIdentity();
  await execFileAsync("git", ["init"], { cwd: repoDir });
  await writeCredentials({
    ...identity,
    walletAddress: "0xabc",
    accountId: "local:abc",
    serverUrl: "http://127.0.0.1:48787",
    webUrl: "http://127.0.0.1:45173"
  }, home);
  const { context, stdout } = createContext();
  context.home = home;
  context.cwd = repoDir;

  await runCli(["repo", "connect", "ducnmm/demo", "--server", "http://octopus.test"], context);

  const remote = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd: repoDir });
  expect(remote.stdout.trim()).toBe("http://octopus.test/ducnmm/demo.git");
  const headers = await execFileAsync(
    "git",
    ["config", "--local", "--get-all", "http.http://octopus.test/ducnmm/demo.git.extraHeader"],
    { cwd: repoDir }
  );
  expect(headers.stdout).toContain("x-octopus-auth-token:");
  expect(headers.stdout).not.toContain(identity.delegatePrivateKey);
  expect(stdout.output()).toContain("Connected ducnmm/demo");
  await rm(home, { recursive: true, force: true });
  await rm(repoDir, { recursive: true, force: true });
});

test("repo list prints visible repositories", async () => {
  const fetchImpl = vi.fn(async () =>
    okJson({
      repos: [
        { owner: "ducnmm", name: "demo", visibility: "public" },
        { owner: "alice", name: "secrets", visibility: "private" }
      ]
    })
  ) as unknown as OctopusFetch;
  const { context, stdout } = createContext(fetchImpl);

  await runCli(["repo", "list"], context);

  const [url, init] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
  expect(String(url)).toBe(`${hostedServerUrl}/v1/repos`);
  expect(init?.method).toBe("GET");
  expect(stdout.output()).toContain("ducnmm/demo (public)");
  expect(stdout.output()).toContain("alice/secrets (private)");
});

test("repo list filters by owner", async () => {
  const fetchImpl = vi.fn(async () =>
    okJson({
      repos: [
        { owner: "ducnmm", name: "demo", visibility: "public" },
        { owner: "alice", name: "secrets", visibility: "private" }
      ]
    })
  ) as unknown as OctopusFetch;
  const { context, stdout } = createContext(fetchImpl);

  await runCli(["repo", "list", "--owner", "alice"], context);

  expect(stdout.output()).toContain("alice/secrets (private)");
  expect(stdout.output()).not.toContain("ducnmm/demo");
});

test("repo list prints an empty-state message", async () => {
  const fetchImpl = vi.fn(async () => okJson({ repos: [] })) as unknown as OctopusFetch;
  const { context, stdout } = createContext(fetchImpl);

  await runCli(["repo", "list", "--owner", "nobody"], context);

  expect(stdout.output()).toContain("No repositories found for nobody");
});

test("repo clone clones with delegate auth and configures the remote", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "octopus-cli-clone-"));
  const home = join(tmp, "home");
  const work = join(tmp, "work");
  await mkdir(home, { recursive: true });
  await mkdir(work, { recursive: true });
  await createServedBareRepo(tmp, "ducnmm", "demo");
  const identity = generateDelegateIdentity();
  await writeCredentials({
    ...identity,
    walletAddress: "0xabc",
    accountId: "local:abc",
    serverUrl: "http://127.0.0.1:48787",
    webUrl: "http://127.0.0.1:45173"
  }, home);

  const fileServer = await serveDirectory(join(tmp, "root"));
  const { context, stdout } = createContext();
  context.home = home;
  context.cwd = work;

  try {
    await runCli(["repo", "clone", "ducnmm/demo", "my-clone", "--server", fileServer.url], context);

    const cloneDir = join(work, "my-clone");
    const remoteUrl = `${fileServer.url}/ducnmm/demo.git`;
    const remote = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd: cloneDir });
    expect(remote.stdout.trim()).toBe(remoteUrl);
    const headers = await execFileAsync(
      "git",
      ["config", "--local", "--get-all", `http.${remoteUrl}.extraHeader`],
      { cwd: cloneDir }
    );
    expect(headers.stdout).toContain("x-octopus-auth-token:");
    expect(headers.stdout).not.toContain(identity.delegatePrivateKey);
    expect(stdout.output()).toContain("Cloned ducnmm/demo");
    expect(stdout.output()).toContain("directory: my-clone");
  } finally {
    await fileServer.close();
    await rm(tmp, { recursive: true, force: true });
  }
});

test("repo clone works anonymously without auth configuration", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "octopus-cli-clone-anon-"));
  const home = join(tmp, "home");
  const work = join(tmp, "work");
  await mkdir(home, { recursive: true });
  await mkdir(work, { recursive: true });
  await createServedBareRepo(tmp, "ducnmm", "demo");

  const fileServer = await serveDirectory(join(tmp, "root"));
  const { context, stdout } = createContext();
  context.home = home;
  context.cwd = work;

  try {
    await runCli(["repo", "clone", "ducnmm/demo", "--server", fileServer.url], context);

    const cloneDir = join(work, "demo");
    const remoteUrl = `${fileServer.url}/ducnmm/demo.git`;
    const remote = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd: cloneDir });
    expect(remote.stdout.trim()).toBe(remoteUrl);
    await expect(
      execFileAsync("git", ["config", "--local", "--get-all", `http.${remoteUrl}.extraHeader`], { cwd: cloneDir })
    ).rejects.toThrow();
    expect(stdout.output()).toContain("Cloned ducnmm/demo");
  } finally {
    await fileServer.close();
    await rm(tmp, { recursive: true, force: true });
  }
});

test("repo clone failure suggests login when logged out", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "octopus-cli-clone-fail-"));
  const home = join(tmp, "home");
  const work = join(tmp, "work");
  await mkdir(join(tmp, "root"), { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(work, { recursive: true });

  const fileServer = await serveDirectory(join(tmp, "root"));
  const { context, stderr } = createContext();
  context.home = home;
  context.cwd = work;

  try {
    await runCli(["repo", "clone", "ducnmm/missing", "--server", fileServer.url], context);

    expect(process.exitCode).toBe(1);
    expect(stderr.output()).toContain("run octopus auth login");
  } finally {
    await fileServer.close();
    await rm(tmp, { recursive: true, force: true });
  }
});

test("pr checkout creates a tracking branch and fast-forwards on re-run", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "octopus-cli-checkout-"));
  const bare = join(tmp, "demo.git");
  const seed = join(tmp, "seed");
  const work = join(tmp, "work");
  await mkdir(seed, { recursive: true });
  await execFileAsync("git", ["init", "--bare", "-b", "main", bare]);
  await git(seed, "init", "-b", "main");
  await git(seed, "commit", "--allow-empty", "-m", "init");
  await git(seed, "switch", "-c", "feature");
  await git(seed, "commit", "--allow-empty", "-m", "feature work");
  await git(seed, "push", bare, "main", "feature");
  await execFileAsync("git", ["clone", bare, work]);
  const featureHead = (await git(seed, "rev-parse", "feature")).stdout.trim();

  const detailFor = (commit: string) => ({
    pullRequest: { ...pullRequestFixture, headCommit: commit, body: "" },
    comparison: { commitCount: 1, fileCount: 0, additions: 0, deletions: 0, patch: "", patchTruncated: false }
  });
  let detail = detailFor(featureHead);
  const fetchImpl = vi.fn(async () => okJson(detail)) as unknown as OctopusFetch;
  const { context, stdout } = createContext(fetchImpl);
  context.cwd = work;

  try {
    await runCli(["pr", "checkout", "ducnmm/demo", "4"], context);

    const branch = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: work });
    expect(branch.stdout.trim()).toBe("feature");
    const head = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: work });
    expect(head.stdout.trim()).toBe(featureHead);
    expect(stdout.output()).toContain("Checked out pull request #4 ducnmm/demo");

    await git(seed, "commit", "--allow-empty", "-m", "more feature work");
    await git(seed, "push", bare, "feature");
    const movedHead = (await git(seed, "rev-parse", "feature")).stdout.trim();
    detail = detailFor(movedHead);

    await runCli(["pr", "checkout", "ducnmm/demo", "4"], context);

    const fastForwarded = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: work });
    expect(fastForwarded.stdout.trim()).toBe(movedHead);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("pr checkout reports a deleted head branch", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "octopus-cli-checkout-gone-"));
  const bare = join(tmp, "demo.git");
  const seed = join(tmp, "seed");
  const work = join(tmp, "work");
  await mkdir(seed, { recursive: true });
  await execFileAsync("git", ["init", "--bare", "-b", "main", bare]);
  await git(seed, "init", "-b", "main");
  await git(seed, "commit", "--allow-empty", "-m", "init");
  await git(seed, "push", bare, "main");
  await execFileAsync("git", ["clone", bare, work]);

  const fetchImpl = vi.fn(async () =>
    okJson({
      pullRequest: { ...pullRequestFixture, headRef: "refs/heads/ghost", body: "" },
      comparison: { commitCount: 0, fileCount: 0, additions: 0, deletions: 0, patch: "", patchTruncated: false }
    })
  ) as unknown as OctopusFetch;
  const { context, stderr } = createContext(fetchImpl);
  context.cwd = work;

  try {
    await runCli(["pr", "checkout", "ducnmm/demo", "4"], context);

    expect(process.exitCode).toBe(1);
    expect(stderr.output()).toContain("Could not fetch head branch ghost");
    expect(stderr.output()).toContain("may have been deleted");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("pr checkout rejects invalid pull request numbers", async () => {
  const fetchImpl = vi.fn() as unknown as OctopusFetch;
  const { context, stderr } = createContext(fetchImpl);

  await runCli(["pr", "checkout", "ducnmm/demo", "0"], context);

  expect(vi.mocked(fetchImpl).mock.calls).toHaveLength(0);
  expect(process.exitCode).toBe(1);
  expect(stderr.output()).toContain("pull request number must be a positive integer");
});

const diffDetailFixture = (patch: string, patchTruncated: boolean) => ({
  pullRequest: { ...pullRequestFixture, body: "Ready for review" },
  comparison: { commitCount: 2, fileCount: 1, additions: 1, deletions: 1, patch, patchTruncated },
  mergeability: { mergeable: true }
});

const samplePatch = [
  "diff --git a/file.txt b/file.txt",
  "index 0000000..1111111 100644",
  "--- a/file.txt",
  "+++ b/file.txt",
  "@@ -1 +1 @@",
  "-old",
  "+new",
  ""
].join("\n");

test("pr diff prints the patch verbatim", async () => {
  const fetchImpl = vi.fn(async () => okJson(diffDetailFixture(samplePatch, false))) as unknown as OctopusFetch;
  const { context, stdout, stderr } = createContext(fetchImpl);

  await runCli(["pr", "diff", "ducnmm/demo", "4"], context);

  const [url] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
  expect(String(url)).toBe(`${hostedServerUrl}/v1/repos/ducnmm/demo/pulls/4`);
  expect(stdout.output()).toBe(samplePatch);
  expect(stderr.output()).toBe("");
});

test("pr diff warns on stderr when the patch is truncated", async () => {
  const fetchImpl = vi.fn(async () => okJson(diffDetailFixture(samplePatch, true))) as unknown as OctopusFetch;
  const { context, stdout, stderr } = createContext(fetchImpl);

  await runCli(["pr", "diff", "ducnmm/demo", "4"], context);

  expect(stdout.output()).toBe(samplePatch);
  expect(stderr.output()).toContain("truncated by the server");
});

test("pr diff surfaces server errors", async () => {
  const fetchImpl = vi.fn(async () => okJson({ error: "Pull request not found" }, 404)) as unknown as OctopusFetch;
  const { context, stderr } = createContext(fetchImpl);

  await runCli(["pr", "diff", "ducnmm/demo", "999"], context);

  expect(process.exitCode).toBe(1);
  expect(stderr.output()).toContain("Pull request not found");
});
