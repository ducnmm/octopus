import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { runCli } from "./program.js";
import type { OctopusFetch } from "./client.js";
import { readCredentials, writeCredentials } from "./credentials.js";
import { generateDelegateIdentity } from "./delegate.js";

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

beforeEach(() => {
  process.exitCode = undefined;
});

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

test("repo create sends a public visibility payload by default", async () => {
  const fetchImpl = vi.fn(async () =>
    okJson({
      owner: "ducnmm",
      name: "demo",
      visibility: "public",
      gitRemotePath: "/ducnmm/demo.git"
    }, 201)
  ) as unknown as OctopusFetch;
  const { context, stdout } = createContext(fetchImpl);

  await runCli(["repo", "create", "demo"], context);

  expect(fetchImpl).toHaveBeenCalledOnce();
  const [url, init] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
  expect(String(url)).toBe("http://127.0.0.1:48787/v1/repos");
  expect(JSON.parse(String(init?.body))).toEqual({
    owner: "ducnmm",
    name: "demo",
    visibility: "public"
  });
  expect(stdout.output()).toContain("Created ducnmm/demo (public)");
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
  expect(JSON.parse(String(init?.body))).toMatchObject({
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
  expect(JSON.parse(String(init?.body))).toMatchObject({
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
  expect(String(url)).toBe("http://127.0.0.1:48787/v1/repos/ducnmm/demo/restore");
  expect(init?.method).toBe("POST");
  expect(stdout.output()).toContain("Restored ducnmm/demo");
  expect(stdout.output()).toContain("source:   sui-local");
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
  await runCli(["repo", "sync-auth", "ducnmm/demo"], context);

  const remote = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd: repoDir });
  expect(remote.stdout.trim()).toBe("http://octopus.test/ducnmm/demo.git");
  const headers = await execFileAsync(
    "git",
    ["config", "--local", "--get-all", "http.http://octopus.test/ducnmm/demo.git.extraHeader"],
    { cwd: repoDir }
  );
  expect(headers.stdout).toContain("x-octopus-auth-token:");
  expect(headers.stdout).not.toContain(identity.delegatePrivateKey);
  expect(headers.stdout.trim().split(/\r?\n/)).toHaveLength(1);
  expect(stdout.output()).toContain("Connected ducnmm/demo");
  expect(stdout.output()).toContain("Refreshed auth for ducnmm/demo");
  await rm(home, { recursive: true, force: true });
  await rm(repoDir, { recursive: true, force: true });
});

test("doctor reports unreachable server and missing credentials", async () => {
  const home = await mkdtemp(join(tmpdir(), "octopus-cli-home-"));
  const fetchImpl = vi.fn(async () => {
    throw new Error("offline");
  }) as unknown as OctopusFetch;
  const { context, stderr, stdout } = createContext(fetchImpl);
  context.home = home;

  await runCli(["doctor", "--server", "http://octopus.test"], context);

  expect(process.exitCode).toBe(1);
  expect(stdout.output()).toContain("warn credentials not found");
  expect(stderr.output()).toContain("fail server is unreachable at http://octopus.test");
  await rm(home, { recursive: true, force: true });
});
