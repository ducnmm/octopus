import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { buildServer } from "../src/app.js";
import type { ServerConfig } from "../src/config.js";

let workspace: string;
let baseUrl: string;
let server: ReturnType<typeof buildServer>;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "octopus-spa-"));
  const dataDir = join(workspace, "data");
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

const PAGE_URLS = [
  "/",
  "/new",
  "/login",
  "/0xowner",
  "/0xowner/demo",
  "/0xowner/demo/commits",
  "/0xowner/demo/blob?ref=main&path=README.md",
  "/0xowner/demo/activity",
  "/0xowner/demo/settings/access",
  "/0xowner/demo/pulls",
  "/0xowner/demo/pulls/new",
  "/0xowner/demo/pulls/3"
];

test("serves the SPA shell for every page URL", async () => {
  for (const path of PAGE_URLS) {
    const response = await fetch(new URL(path, baseUrl), { headers: { accept: "text/html" } });
    expect(response.status, path).toBe(200);
    expect(response.headers.get("content-type"), path).toContain("text/html");
    expect(await response.text(), path).toContain('<div id="root">');
  }
});

test("serves hashed SPA bundle assets with immutable caching", async () => {
  const shell = await (await fetch(new URL("/", baseUrl), { headers: { accept: "text/html" } })).text();
  const scriptMatch = shell.match(/src="(\/assets\/[^"]+\.js)"/);
  expect(scriptMatch).toBeTruthy();
  const scriptResponse = await fetch(new URL(scriptMatch![1]!, baseUrl));
  expect(scriptResponse.status).toBe(200);
  expect(scriptResponse.headers.get("content-type")).toContain("text/javascript");
  expect(scriptResponse.headers.get("cache-control")).toContain("immutable");
});

test("does not shadow JSON, health, or Git smart-HTTP endpoints", async () => {
  const repoList = await fetch(new URL("/v1/repos", baseUrl), { headers: { accept: "text/html" } });
  expect(repoList.status).toBe(200);
  expect(repoList.headers.get("content-type")).toContain("application/json");

  const health = await fetch(new URL("/healthz", baseUrl), { headers: { accept: "text/html" } });
  expect(health.headers.get("content-type")).not.toContain("text/html");

  const missingApi = await fetch(new URL("/v1/does-not-exist", baseUrl), { headers: { accept: "text/html" } });
  expect(missingApi.status).toBe(404);
  await expect(missingApi.json()).resolves.toMatchObject({ error: "Not found" });

  // A Git client (no text/html accept) never receives the SPA shell.
  const gitProbe = await fetch(new URL("/0xowner/missing.git/info/refs?service=git-upload-pack", baseUrl));
  expect(gitProbe.headers.get("content-type")).not.toContain("text/html");
});

test("rejects path traversal out of the SPA bundle", async () => {
  const traversal = await fetch(new URL("/assets/..%2F..%2F..%2Fpackage.json", baseUrl));
  expect(traversal.status).toBe(404);
});
