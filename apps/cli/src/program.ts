import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { execFile, spawn } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { platform } from "node:os";
import { Command, InvalidArgumentError } from "commander";
import {
  authCallbackRequestSchema,
  createPullRequestRequestSchema,
  createRepoRequestSchema,
  delegateAuthHeaders,
  type OctopusCredentials
} from "@octopus/shared";
import { requestJson, type OctopusFetch } from "./client.js";
import { credentialsPath, deleteCredentials, readCredentials, writeCredentials } from "./credentials.js";
import { createDelegateAuthToken, generateDelegateIdentity, identityFromPrivateKey } from "./delegate.js";
import { loadDotenv } from "./env.js";

export type CliIO = {
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
};

export type CliContext = CliIO & {
  env: NodeJS.ProcessEnv;
  fetch: OctopusFetch;
  cwd?: string;
  home?: string;
  openBrowser?: (url: string) => void;
};

type RepoCreateOptions = {
  owner?: string;
  private?: boolean | string;
  public?: boolean;
  server: string;
};

type RepoServerOptions = {
  server: string;
};

type AuthLoginOptions = {
  server: string;
  webUrl: string;
  callbackPort?: string;
  timeoutMs?: string;
  delegatePrivateKey?: string;
  packageId?: string;
  accountRegistryId?: string;
  repoRegistryId?: string;
  browser?: boolean;
};

type RepoConnectOptions = {
  remote: string;
  server: string;
};

type PullRequestCreateOptions = {
  base?: string;
  head: string;
  title: string;
  body?: string;
  server: string;
};

type AuthServerConfig = {
  suiMode: "local" | "testnet";
  suiNetwork: string;
  suiRpcUrl: string;
  packageId?: string;
  accountRegistryId?: string;
  repoRegistryId?: string;
  serverDelegatePublicKey?: string;
  serverDelegateAddress?: string;
};

const REST_AUTH_EXPIRES_IN_MS = 5 * 60 * 1000;
const GIT_AUTH_EXPIRES_IN_MS = 30 * 24 * 60 * 60 * 1000;

const defaultBaseUrl = (env: NodeJS.ProcessEnv): string => {
  return `http://${env.OCTOPUS_HOST ?? "127.0.0.1"}:${env.OCTOPUS_PORT ?? "48787"}`;
};

const writeLine = (stream: Pick<NodeJS.WriteStream, "write">, line = ""): void => {
  stream.write(`${line}\n`);
};

const parseOptionalBoolean = (value: boolean | string | undefined, optionName: string): boolean => {
  if (value === undefined || value === false) {
    return false;
  }

  if (value === true) {
    return true;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new InvalidArgumentError(`${optionName} expects true or false`);
};

const visibilityFromOptions = (options: RepoCreateOptions): "public" | "private" => {
  const privateRequested = parseOptionalBoolean(options.private, "--private");
  if (options.public && privateRequested) {
    throw new InvalidArgumentError("choose only one of --public or --private");
  }

  return privateRequested ? "private" : "public";
};

const splitRepo = (repo: string): { owner: string; name: string } => {
  const [owner, name, extra] = repo.split("/");
  if (!owner || !name || extra) {
    throw new InvalidArgumentError("repo must use owner/name format");
  }

  return { owner, name };
};

const readRequestBody = async (request: IncomingMessage): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
};

const sendJson = (
  response: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>
): void => {
  response.writeHead(statusCode, {
    "content-type": "application/json"
  });
  response.end(JSON.stringify(body));
};

const defaultOpenBrowser = (url: string): void => {
  const command =
    platform() === "darwin" ? "open" : platform() === "win32" ? "cmd" : "xdg-open";
  const args = platform() === "win32" ? ["/c", "start", "", url] : [url];
  execFile(command, args, () => {
    // Users can manually open the URL printed by the CLI if this fails.
  });
};

const normalizeBaseUrl = (url: string): string => {
  return url.replace(/\/+$/, "");
};

const credentialUrlParts = (serverUrl: string): { protocol: string; host: string } => {
  const url = new URL(serverUrl);
  return {
    protocol: url.protocol.replace(/:$/, ""),
    host: url.port ? `${url.hostname}:${url.port}` : url.hostname
  };
};

const safeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const authHeaders = async (
  home: string | undefined,
  scope: "rest" | "git" = "rest",
  expiresInMs = REST_AUTH_EXPIRES_IN_MS
): Promise<Record<string, string>> => {
  const credentials = await readCredentials(home);
  if (!credentials) {
    return {};
  }

  return {
    [delegateAuthHeaders.token]: await createDelegateAuthToken({
      credentials,
      scope,
      expiresInMs
    })
  };
};

const fetchAuthServerConfig = async (
  context: CliContext,
  serverUrl: string
): Promise<AuthServerConfig | null> => {
  try {
    return await requestJson<AuthServerConfig>(new URL("/v1/auth/config", serverUrl).toString(), {
      fetch: context.fetch,
      method: "GET"
    });
  } catch {
    return null;
  }
};

type RunGitOptions = {
  timeoutMs?: number;
};

const runGit = async (
  args: string[],
  cwd?: string,
  input?: string,
  env: NodeJS.ProcessEnv = process.env,
  options: RunGitOptions = {}
): Promise<string> => {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn("git", args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;
    let timeout: NodeJS.Timeout | undefined;
    let forceKillTimeout: NodeJS.Timeout | undefined;

    const clearTimers = (): void => {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (forceKillTimeout) {
        clearTimeout(forceKillTimeout);
      }
    };

    if (options.timeoutMs) {
      timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        forceKillTimeout = setTimeout(() => child.kill("SIGKILL"), 250);
      }, options.timeoutMs);
    }

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimers();
      reject(error);
    });
    child.on("close", (code) => {
      clearTimers();
      if (timedOut) {
        reject(new Error(`git ${args.join(" ")} timed out after ${options.timeoutMs}ms`));
        return;
      }

      if (code === 0) {
        resolvePromise(Buffer.concat(stdout).toString("utf8").trim());
        return;
      }

      reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || `git ${args.join(" ")} failed`));
    });

    child.stdin.end(input);
  });
};

const nonInteractiveGitEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  GCM_INTERACTIVE: "never",
  GIT_ASKPASS: "false",
  GIT_TERMINAL_PROMPT: "0",
  SSH_ASKPASS: "false"
});

const currentGitRemoteUrl = async (
  cwd: string | undefined,
  remoteName: string
): Promise<string> => {
  return await runGit(["remote", "get-url", remoteName], cwd);
};

const configureAuthHeader = async (
  cwd: string | undefined,
  remoteUrl: string,
  credentials: OctopusCredentials
): Promise<void> => {
  const configKey = `http.${remoteUrl}.extraHeader`;
  try {
    await runGit(["config", "--local", "--unset-all", configKey], cwd);
  } catch {
    // The key is absent on first connect.
  }

  await runGit([
    "config",
    "--local",
    "--add",
    configKey,
    `${delegateAuthHeaders.token}: ${await createDelegateAuthToken({
      credentials,
      scope: "git",
      expiresInMs: GIT_AUTH_EXPIRES_IN_MS
    })}`
  ], cwd);
};

const configureRemote = async (
  cwd: string | undefined,
  remoteName: string,
  remoteUrl: string
): Promise<void> => {
  try {
    await runGit(["remote", "get-url", remoteName], cwd);
    await runGit(["remote", "set-url", remoteName, remoteUrl], cwd);
  } catch {
    await runGit(["remote", "add", remoteName, remoteUrl], cwd);
  }

};

const gitCredentialInput = (serverUrl: string, password?: string): string => {
  const { protocol, host } = credentialUrlParts(serverUrl);
  return [
    `protocol=${protocol}`,
    `host=${host}`,
    "username=octopus",
    ...(password ? [`password=${password}`] : []),
    ""
  ].join("\n");
};

const approveGitCredential = async (
  credentials: OctopusCredentials,
  cwd: string | undefined
): Promise<void> => {
  await runGit(
    ["credential", "approve"],
    cwd,
    gitCredentialInput(
      credentials.serverUrl,
      await createDelegateAuthToken({
        credentials,
        scope: "git",
        expiresInMs: GIT_AUTH_EXPIRES_IN_MS
      })
    )
  );
};

const rejectGitCredential = async (
  serverUrl: string,
  cwd: string | undefined
): Promise<void> => {
  await runGit(["credential", "reject"], cwd, gitCredentialInput(serverUrl));
};

const fillGitCredential = async (
  serverUrl: string,
  cwd: string | undefined
): Promise<string> => {
  return await runGit(
    ["credential", "fill"],
    cwd,
    gitCredentialInput(serverUrl),
    nonInteractiveGitEnv(),
    { timeoutMs: 2_000 }
  );
};

const startLoginCallbackServer = async (input: {
  port: number;
  timeoutMs: number;
  state: string;
  credentialsBase: Omit<OctopusCredentials, "walletAddress" | "accountId" | "loggedInAt">;
}): Promise<{ callbackUrl: string; credentials: Promise<OctopusCredentials>; close: () => Promise<void> }> => {
  let settleCredentials!: (credentials: OctopusCredentials) => void;
  let rejectCredentials!: (error: Error) => void;
  const credentials = new Promise<OctopusCredentials>((resolve, reject) => {
    settleCredentials = resolve;
    rejectCredentials = reject;
  });

  const server = createServer(async (request, response) => {
    try {
      response.setHeader("access-control-allow-origin", "*");
      response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
      response.setHeader("access-control-allow-headers", "content-type");

      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        sendJson(response, 404, { error: "Not found" });
        return;
      }

      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      const body =
        request.method === "POST"
          ? JSON.parse((await readRequestBody(request)).toString("utf8") || "{}") as Record<string, unknown>
          : Object.fromEntries(url.searchParams.entries());
      const callbackState = typeof body.state === "string" ? body.state : "";
      if (!safeEqual(callbackState, input.state)) {
        sendJson(response, 400, { error: "Invalid login callback state" });
        return;
      }

      const callback = authCallbackRequestSchema.parse({
        ...body,
        walletAddress: body.walletAddress ?? body.address,
        accountId: body.accountId ?? body.account_id,
        packageId: body.packageId ?? body.package_id,
        accountRegistryId: body.accountRegistryId ?? body.account_registry_id,
        repoRegistryId: body.repoRegistryId ?? body.repo_registry_id
      });
      const nextCredentials: OctopusCredentials = {
        ...input.credentialsBase,
        walletAddress: callback.walletAddress,
        accountId: callback.accountId,
        serverUrl: callback.serverUrl ?? input.credentialsBase.serverUrl,
        webUrl: callback.webUrl ?? input.credentialsBase.webUrl,
        packageId: callback.packageId ?? input.credentialsBase.packageId,
        accountRegistryId: callback.accountRegistryId ?? input.credentialsBase.accountRegistryId,
        repoRegistryId: callback.repoRegistryId ?? input.credentialsBase.repoRegistryId,
        loggedInAt: new Date().toISOString()
      };
      settleCredentials(nextCredentials);
      sendJson(response, 200, { ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      rejectCredentials(new Error(message));
      sendJson(response, 400, { error: message });
    }
  });

  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(input.port, "127.0.0.1", () => resolvePromise());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not start login callback server");
  }

  const timeout = setTimeout(() => {
    rejectCredentials(new Error("Timed out waiting for wallet approval"));
  }, input.timeoutMs);

  credentials.finally(() => clearTimeout(timeout)).catch(() => undefined);

  return {
    callbackUrl: `http://127.0.0.1:${address.port}/callback`,
    credentials,
    close: async () => {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
  };
};

export const createProgram = (context: CliContext): Command => {
  const program = new Command();
  const baseUrl = defaultBaseUrl(context.env);

  program
    .name("ocp")
    .description("Octopus developer CLI")
    .version("0.1.0");

  program.configureOutput({
    writeOut: (value) => context.stdout.write(value),
    writeErr: (value) => context.stderr.write(value)
  });

  const authCommand = program
    .command("auth")
    .description("Manage authentication");

  authCommand
    .command("login")
    .description("Start wallet-backed CLI login")
    .option("--server <url>", "Octopus server URL", baseUrl)
    .option("--web-url <url>", "Octopus web login URL", context.env.OCTOPUS_WEB_URL ?? "http://127.0.0.1:45173")
    .option("--callback-port <port>", "localhost callback port", "0")
    .option("--timeout-ms <ms>", "wallet approval timeout", "300000")
    .option("--delegate-private-key <key>", "reuse an existing delegate private key")
    .option("--package-id <id>", "Sui package ID", context.env.SUI_PACKAGE_ID)
    .option("--account-registry-id <id>", "Octopus account registry object ID", context.env.OCTOPUS_ACCOUNT_REGISTRY_ID)
    .option("--repo-registry-id <id>", "Octopus repo registry object ID", context.env.OCTOPUS_REPO_REGISTRY_ID)
    .option("--no-browser", "print the login URL without opening a browser")
    .action(async (options: AuthLoginOptions) => {
      const serverUrl = normalizeBaseUrl(options.server);
      const webUrl = normalizeBaseUrl(options.webUrl);
      const serverConfig = await fetchAuthServerConfig(context, serverUrl);
      const packageId = options.packageId ?? serverConfig?.packageId;
      const accountRegistryId = options.accountRegistryId ?? serverConfig?.accountRegistryId;
      const repoRegistryId = options.repoRegistryId ?? serverConfig?.repoRegistryId;

      if (serverConfig?.suiMode === "testnet" && (!packageId || !accountRegistryId || !repoRegistryId)) {
        throw new Error(
          "Server is in testnet mode but Sui package/registry IDs are missing. Set SUI_PACKAGE_ID, OCTOPUS_ACCOUNT_REGISTRY_ID, and OCTOPUS_REPO_REGISTRY_ID."
        );
      }

      const identity = options.delegatePrivateKey
        ? identityFromPrivateKey(options.delegatePrivateKey)
        : generateDelegateIdentity();
      const loginState = randomBytes(16).toString("hex");
      const callback = await startLoginCallbackServer({
        port: Number.parseInt(options.callbackPort ?? "0", 10),
        timeoutMs: Number.parseInt(options.timeoutMs ?? "300000", 10),
        state: loginState,
        credentialsBase: {
          ...identity,
          serverUrl,
          webUrl,
          packageId,
          accountRegistryId,
          repoRegistryId
        }
      });

      const loginUrl = new URL("/login", webUrl);
      loginUrl.searchParams.set("callback", callback.callbackUrl);
      loginUrl.searchParams.set("server", serverUrl);
      loginUrl.searchParams.set("delegatePublicKey", identity.delegatePublicKey);
      loginUrl.searchParams.set("delegateAddress", identity.delegateAddress);
      loginUrl.searchParams.set("state", loginState);
      if (packageId) loginUrl.searchParams.set("packageId", packageId);
      if (accountRegistryId) loginUrl.searchParams.set("accountRegistryId", accountRegistryId);
      if (repoRegistryId) loginUrl.searchParams.set("repoRegistryId", repoRegistryId);
      if (serverConfig?.serverDelegatePublicKey && serverConfig.serverDelegateAddress) {
        loginUrl.searchParams.set("serverDelegatePublicKey", serverConfig.serverDelegatePublicKey);
        loginUrl.searchParams.set("serverDelegateAddress", serverConfig.serverDelegateAddress);
      }

      writeLine(context.stdout, `Open: ${loginUrl.toString()}`);
      writeLine(context.stdout, `Waiting for wallet approval at ${callback.callbackUrl}`);
      if (options.browser !== false) {
        (context.openBrowser ?? defaultOpenBrowser)(loginUrl.toString());
      }

      try {
        const credentials = await callback.credentials;
        const path = await writeCredentials(credentials, context.home);
        await approveGitCredential(credentials, context.cwd);
        writeLine(context.stdout, `Logged in as ${credentials.walletAddress}`);
        writeLine(context.stdout, `Delegate: ${credentials.delegateAddress}`);
        writeLine(context.stdout, `Credentials: ${path}`);
        writeLine(context.stdout, `Git credential: stored for ${credentials.serverUrl}`);
      } finally {
        await callback.close();
      }
    });

  authCommand
    .command("whoami")
    .description("Show the saved wallet/delegate identity")
    .action(async () => {
      const credentials = await readCredentials(context.home);
      if (!credentials) {
        throw new Error(`Not logged in. Run ocp auth login first.`);
      }

      writeLine(context.stdout, `Wallet:   ${credentials.walletAddress}`);
      writeLine(context.stdout, `Account:  ${credentials.accountId}`);
      writeLine(context.stdout, `Delegate: ${credentials.delegateAddress}`);
      writeLine(context.stdout, `Server:   ${credentials.serverUrl}`);
    });

  authCommand
    .command("logout")
    .description("Remove saved local credentials and Git credential")
    .action(async () => {
      const credentials = await readCredentials(context.home);
      if (credentials) {
        try {
          await rejectGitCredential(credentials.serverUrl, context.cwd);
          writeLine(context.stdout, `Git credential removed for ${credentials.serverUrl}`);
        } catch (error) {
          writeLine(context.stdout, `warn could not remove Git credential: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      const removed = await deleteCredentials(context.home);
      writeLine(context.stdout, removed ? "Logged out" : "No credentials found");
    });

  const repoCommand = program
    .command("repo")
    .description("Manage Octopus repositories");

  repoCommand
    .command("create")
    .argument("<name>", "repository name")
    .option("--owner <owner>", "repository owner namespace; defaults to primary SuiNS or wallet address", context.env.OCTOPUS_OWNER)
    .option("--public", "create a public repository")
    .option("--private [value]", "create a private repository; use --private=false for public compatibility")
    .option("--server <url>", "Octopus server URL", baseUrl)
    .action(async (name: string, options: RepoCreateOptions) => {
      const payload = createRepoRequestSchema.parse({
        owner: options.owner,
        name,
        visibility: visibilityFromOptions(options)
      });

      const repo = await requestJson<{
        owner: string;
        name: string;
        visibility: string;
        gitRemotePath: string;
      }>(new URL("/v1/repos", options.server).toString(), {
        fetch: context.fetch,
        method: "POST",
        headers: await authHeaders(context.home),
        body: JSON.stringify(payload)
      });

      const remote = new URL(repo.gitRemotePath, options.server).toString();
      writeLine(context.stdout, `Created ${repo.owner}/${repo.name} (${repo.visibility})`);
      writeLine(context.stdout, `Remote: ${remote}`);
      writeLine(context.stdout, `Next: git remote add origin ${remote}`);
      writeLine(context.stdout, `Next: git push origin main`);
    });

  repoCommand
    .command("connect")
    .argument("<repo>", "repository in owner/name form")
    .option("--remote <name>", "Git remote name", "origin")
    .option("--server <url>", "Octopus server URL", baseUrl)
    .description("Configure a Git remote")
    .action(async (repo: string, options: RepoConnectOptions) => {
      const { owner, name } = splitRepo(repo);
      const remoteUrl = new URL(`/${owner}/${name}.git`, normalizeBaseUrl(options.server)).toString();
      await configureRemote(context.cwd, options.remote, remoteUrl);
      writeLine(context.stdout, `Connected ${repo}`);
      writeLine(context.stdout, `  remote: ${options.remote}`);
      writeLine(context.stdout, `  url:    ${remoteUrl}`);
      writeLine(context.stdout, `Next: git push ${options.remote} main`);
    });

  repoCommand
    .command("sync-auth")
    .argument("<repo>", "repository in owner/name form")
    .option("--remote <name>", "Git remote name", "origin")
    .description("Refresh repo-local delegate auth headers without changing the remote URL")
    .action(async (repo: string, options: { remote: string }) => {
      splitRepo(repo);
      const credentials = await readCredentials(context.home);
      if (!credentials) {
        throw new Error(`Not logged in. Run ocp auth login first.`);
      }

      const remoteUrl = await currentGitRemoteUrl(context.cwd, options.remote);
      await configureAuthHeader(context.cwd, remoteUrl, credentials);
      writeLine(context.stdout, `Refreshed auth for ${repo}`);
      writeLine(context.stdout, `  remote: ${options.remote}`);
      writeLine(context.stdout, `  url:    ${remoteUrl}`);
    });

  repoCommand
    .command("manifests")
    .argument("<repo>", "repository in owner/name form")
    .option("--server <url>", "Octopus server URL", baseUrl)
    .description("List local artifact manifests for a repository")
    .action(async (repo: string, options: RepoServerOptions) => {
      const { owner, name } = splitRepo(repo);
      const response = await requestJson<{
        manifests: Array<{
          manifestId: string;
          refName: string;
          newCommit: string;
          walrusBlobId: string;
          artifactDigest: string;
          storageMode: string;
        }>;
      }>(new URL(`/v1/repos/${owner}/${name}/manifests`, options.server).toString(), {
        fetch: context.fetch,
        method: "GET",
        headers: await authHeaders(context.home)
      });

      if (response.manifests.length === 0) {
        writeLine(context.stdout, `No manifests for ${repo}`);
        return;
      }

      for (const manifest of response.manifests) {
        writeLine(context.stdout, `${manifest.manifestId}`);
        writeLine(context.stdout, `  ref:    ${manifest.refName}`);
        writeLine(context.stdout, `  commit: ${manifest.newCommit}`);
        writeLine(context.stdout, `  blob:   ${manifest.walrusBlobId}`);
        writeLine(context.stdout, `  mode:   ${manifest.storageMode}`);
        writeLine(context.stdout, `  sha256: ${manifest.artifactDigest}`);
      }
    });

  const restoreRepo = async (repo: string, options: RepoServerOptions) => {
    const { owner, name } = splitRepo(repo);
    const response = await requestJson<{
      owner: string;
      repo: string;
      repoPath: string;
      manifestId: string;
      refName: string;
      restoredCommit: string;
      artifactDigest: string;
      storageMode: string;
      manifestSource: string;
    }>(new URL(`/v1/repos/${owner}/${name}/restore`, options.server).toString(), {
      fetch: context.fetch,
      method: "POST",
      headers: await authHeaders(context.home)
    });

    writeLine(context.stdout, `Restored ${response.owner}/${response.repo}`);
    writeLine(context.stdout, `  repo:     ${response.repoPath}`);
    writeLine(context.stdout, `  manifest: ${response.manifestId}`);
    writeLine(context.stdout, `  ref:      ${response.refName}`);
    writeLine(context.stdout, `  commit:   ${response.restoredCommit}`);
    writeLine(context.stdout, `  mode:     ${response.storageMode}`);
    writeLine(context.stdout, `  source:   ${response.manifestSource}`);
    writeLine(context.stdout, `  sha256:   ${response.artifactDigest}`);
  };

  repoCommand
    .command("restore")
    .argument("<repo>", "repository in owner/name form")
    .option("--server <url>", "Octopus server URL", baseUrl)
    .description("Restore a repository cache from durable storage")
    .action(restoreRepo);

  program
    .command("restore")
    .argument("<repo>", "repository in owner/name form")
    .option("--server <url>", "Octopus server URL", baseUrl)
    .description("Restore a repository cache from durable storage")
    .action(restoreRepo);

  program
    .command("doctor")
    .description("Check Octopus CLI, server, auth, and current Git remote configuration")
    .option("--server <url>", "Octopus server URL", baseUrl)
    .option("--remote <name>", "Git remote name", "origin")
    .action(async (options: { server: string; remote: string }) => {
      const failures: string[] = [];
      const warnings: string[] = [];
      const serverUrl = normalizeBaseUrl(options.server);

      try {
        const version = await runGit(["--version"]);
        writeLine(context.stdout, `ok   git: ${version}`);
      } catch (error) {
        failures.push(`git is unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }

      try {
        const health = await requestJson<{ ok: boolean; service: string }>(new URL("/healthz", serverUrl).toString(), {
          fetch: context.fetch,
          method: "GET"
        });
        if (health.ok) {
          writeLine(context.stdout, `ok   server: ${health.service} at ${serverUrl}`);
        } else {
          failures.push(`server health check returned ok=false at ${serverUrl}`);
        }
      } catch (error) {
        failures.push(`server is unreachable at ${serverUrl}: ${error instanceof Error ? error.message : String(error)}`);
      }

      try {
        const authConfig = await requestJson<AuthServerConfig>(new URL("/v1/auth/config", serverUrl).toString(), {
          fetch: context.fetch,
          method: "GET"
        });
        writeLine(context.stdout, `ok   auth config: ${authConfig.suiMode}/${authConfig.suiNetwork}`);
      } catch (error) {
        warnings.push(`auth config unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }

      const credentials = await readCredentials(context.home);
      if (credentials) {
        writeLine(context.stdout, `ok   credentials: ${credentialsPath(context.home)}`);
        if (normalizeBaseUrl(credentials.serverUrl) !== serverUrl) {
          warnings.push(`credentials server is ${credentials.serverUrl}, but doctor checked ${serverUrl}`);
        }
      } else {
        warnings.push(`credentials not found at ${credentialsPath(context.home)}`);
      }

      try {
        const credential = await fillGitCredential(serverUrl, context.cwd);
        if (credential.includes("password=")) {
          writeLine(context.stdout, `ok   git credential: configured for ${serverUrl}`);
        } else {
          warnings.push(`git credential for ${serverUrl} did not include a password`);
        }
      } catch {
        warnings.push(`git credential is not configured for ${serverUrl}`);
      }

      try {
        const remoteUrl = await currentGitRemoteUrl(context.cwd, options.remote);
        writeLine(context.stdout, `ok   git remote ${options.remote}: ${remoteUrl}`);
        const remoteHost = new URL(remoteUrl).host;
        const serverHost = new URL(serverUrl).host;
        if (remoteHost !== serverHost) {
          warnings.push(`git remote ${options.remote} points to ${remoteHost}, but doctor checked ${serverHost}`);
        }

        try {
          const header = await runGit([
            "config",
            "--local",
            "--get-all",
            `http.${remoteUrl}.extraHeader`
          ], context.cwd);
          if (header.includes(delegateAuthHeaders.token)) {
            writeLine(context.stdout, `ok   git auth header: configured for ${options.remote}`);
          } else {
            warnings.push(`git auth header for ${options.remote} does not include ${delegateAuthHeaders.token}`);
          }
        } catch {
          warnings.push(`git auth header is not configured for ${options.remote}; Git credential helper will be used`);
        }
      } catch {
        warnings.push(`git remote ${options.remote} is not configured in this directory`);
      }

      for (const warning of warnings) {
        writeLine(context.stdout, `warn ${warning}`);
      }
      for (const failure of failures) {
        writeLine(context.stderr, `fail ${failure}`);
      }

      if (failures.length > 0) {
        process.exitCode = 1;
      }
    });

  const pullRequestCommand = program
    .command("pr")
    .description("Manage Octopus pull requests");

  pullRequestCommand
    .command("create")
    .argument("<repo>", "repository in owner/name form")
    .requiredOption("--head <ref>", "source branch")
    .requiredOption("--title <title>", "pull request title")
    .option("--base <ref>", "target branch; defaults to the repository default branch")
    .option("--body <body>", "pull request description", "")
    .option("--server <url>", "Octopus server URL", baseUrl)
    .description("Open a pull request between two branches")
    .action(async (repo: string, options: PullRequestCreateOptions) => {
      const { owner, name } = splitRepo(repo);
      const payload = createPullRequestRequestSchema.parse({
        title: options.title,
        body: options.body ?? "",
        baseRef: options.base,
        headRef: options.head
      });

      const response = await requestJson<{
        pullRequest: {
          number: number;
          title: string;
          baseRef: string;
          headRef: string;
          status: string;
        };
      }>(new URL(`/v1/repos/${owner}/${name}/pulls`, options.server).toString(), {
        fetch: context.fetch,
        method: "POST",
        headers: await authHeaders(context.home),
        body: JSON.stringify(payload)
      });

      const href = new URL(`/${owner}/${name}/pulls/${response.pullRequest.number}`, options.server).toString();
      writeLine(context.stdout, `Created pull request #${response.pullRequest.number} ${owner}/${name}`);
      writeLine(context.stdout, `  title: ${response.pullRequest.title}`);
      writeLine(context.stdout, `  base:  ${response.pullRequest.baseRef.replace(/^refs\/heads\//, "")}`);
      writeLine(context.stdout, `  head:  ${response.pullRequest.headRef.replace(/^refs\/heads\//, "")}`);
      writeLine(context.stdout, `  url:   ${href}`);
    });

  return program;
};

export const runCli = async (
  argv: string[],
  context: Partial<CliContext> = {}
): Promise<void> => {
  if (!context.env) {
    loadDotenv(context.cwd ?? process.cwd());
  }

  const stderr = context.stderr ?? process.stderr;
  const program = createProgram({
    env: context.env ?? process.env,
    fetch: context.fetch ?? fetch,
    cwd: context.cwd ?? process.cwd(),
    home: context.home,
    openBrowser: context.openBrowser,
    stdout: context.stdout ?? process.stdout,
    stderr
  });

  program.exitOverride();

  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (error) {
    if (error instanceof Error && error.name === "CommanderError") {
      const exitCode = (error as Error & { exitCode?: number }).exitCode;
      process.exitCode = exitCode ?? 1;
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    writeLine(stderr, `error: ${message}`);
    process.exitCode = 1;
  }
};
