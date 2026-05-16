import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { runCli } from "./program.js";
import type { OctopusFetch } from "./client.js";

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
      stdout: stdout.stream,
      stderr: stderr.stream
    },
    stderr,
    stdout
  };
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
  expect(String(url)).toBe("http://127.0.0.1:18787/v1/repos");
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
  expect(String(url)).toBe("http://127.0.0.1:18787/v1/repos/ducnmm/demo/restore");
  expect(init?.method).toBe("POST");
  expect(stdout.output()).toContain("Restored ducnmm/demo");
  expect(stdout.output()).toContain("source:   sui-local");
});

test("auth login reports the credential location while wallet approval is pending", async () => {
  const { context, stdout } = createContext();

  await runCli(["auth", "login"], context);

  expect(stdout.output()).toContain("auth login is not wired to wallet approval yet");
  expect(stdout.output()).toContain("/tmp/octopus-home/.octopus/credentials.json");
});
