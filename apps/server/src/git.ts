import { spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { dirname, normalize, resolve, sep } from "node:path";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ownerNameSchema, repoNameSchema } from "@octopus/shared";
import { parseDelegateAuth, type AuthContext } from "./auth.js";
import type { ServerConfig } from "./config.js";
import { createPushArtifacts, deletedRefs, listRefs } from "./artifacts.js";
import { indexRepository } from "./indexer.js";
import { restoreRepository } from "./restore.js";
import { anchorDeletedRefs, anchorPushManifests, canReadRepo, canWriteRepo, readSuiRepoState, readSuiRepoStateForAuthorization } from "./sui.js";
import { recordPushAttempt } from "./push-attempts.js";

type GitResult = {
  stdout: Buffer;
  stderr: Buffer;
};

const runGit = async (
  args: string[],
  input?: Buffer,
  env: NodeJS.ProcessEnv = process.env
): Promise<GitResult> => {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn("git", args, {
      env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const result = {
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr)
      };

      if (code === 0) {
        resolvePromise(result);
        return;
      }

      reject(new Error(`git ${args.join(" ")} failed: ${result.stderr.toString()}`));
    });

    child.stdin.end(input);
  });
};

export const bareRepoPath = (repoRoot: string, owner: string, repo: string): string => {
  ownerNameSchema.parse(owner);
  repoNameSchema.parse(repo);

  const root = resolve(repoRoot);
  const path = resolve(root, owner, `${repo}.git`);
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    throw new Error("Repository path escaped the configured root");
  }

  return path;
};

export const initBareRepository = async (
  repoRoot: string,
  owner: string,
  repo: string
): Promise<string> => {
  const path = bareRepoPath(repoRoot, owner, repo);
  await mkdir(dirname(path), { recursive: true });

  try {
    await access(path);
  } catch {
    await runGit(["init", "--bare", path]);
  }

  await runGit(["--git-dir", path, "config", "http.receivepack", "true"]);
  await runGit(["--git-dir", path, "config", "octopus.owner", owner]);
  await runGit(["--git-dir", path, "config", "octopus.name", repo]);

  return path;
};

export const assertRepositoryExists = async (
  repoRoot: string,
  owner: string,
  repo: string
): Promise<string> => {
  const path = bareRepoPath(repoRoot, owner, repo);
  await access(path);
  return path;
};

const readRequestBody = async (request: FastifyRequest): Promise<Buffer> => {
  if (Buffer.isBuffer(request.body)) {
    return request.body;
  }

  if (typeof request.body === "string") {
    return Buffer.from(request.body);
  }

  return Buffer.alloc(0);
};

const splitCgiResponse = (output: Buffer): { headers: string; body: Buffer } => {
  const separator = output.indexOf("\r\n\r\n");
  if (separator >= 0) {
    return {
      headers: output.subarray(0, separator).toString("utf8"),
      body: output.subarray(separator + 4)
    };
  }

  const lfSeparator = output.indexOf("\n\n");
  if (lfSeparator >= 0) {
    return {
      headers: output.subarray(0, lfSeparator).toString("utf8"),
      body: output.subarray(lfSeparator + 2)
    };
  }

  return { headers: "", body: output };
};

const parseRepoFromPath = (pathName: string): { owner: string; repo: string } | null => {
  const match = pathName.match(/^\/([^/]+)\/([^/]+)\.git(?:\/|$)/);
  if (!match) {
    return null;
  }

  return {
    owner: decodeURIComponent(match[1] ?? ""),
    repo: decodeURIComponent(match[2] ?? "")
  };
};

const repositoryExists = async (repoRoot: string, owner: string, repo: string): Promise<string | null> => {
  try {
    return await assertRepositoryExists(repoRoot, owner, repo);
  } catch {
    return null;
  }
};

export const handleGitHttp = async (
  request: FastifyRequest,
  reply: FastifyReply,
  config: ServerConfig
): Promise<void> => {
  const url = new URL(request.url, "http://octopus.local");
  const repoRef = parseRepoFromPath(url.pathname);
  if (!repoRef) {
    await reply.code(404).send({ error: "Not a Git repository path" });
    return;
  }

  const isReceivePack = request.method === "POST" && url.pathname.endsWith("/git-receive-pack");
  const isReceivePackRequest =
    isReceivePack ||
    (request.method === "GET" &&
      url.pathname.endsWith("/info/refs") &&
      url.searchParams.get("service") === "git-receive-pack");
  const isUploadPackRequest =
    request.method === "POST" && url.pathname.endsWith("/git-upload-pack") ||
    (request.method === "GET" &&
      url.pathname.endsWith("/info/refs") &&
      url.searchParams.get("service") === "git-upload-pack");
  const repoStateResult = await readSuiRepoStateForAuthorization(config, repoRef.owner, repoRef.repo);
  if (config.suiMode === "testnet" && !repoStateResult.authoritative) {
    await reply.code(503).send({ error: "Repository authorization state is temporarily unavailable" });
    return;
  }

  if (config.suiMode === "testnet" && !repoStateResult.state) {
    await reply.code(404).send({ error: "Repository state not found" });
    return;
  }

  const repoState = repoStateResult.state;
  let auth: AuthContext | null = null;

  if (isReceivePackRequest) {
    try {
      auth = await parseDelegateAuth(config, request);
    } catch (error) {
      await reply.code(401).send({ error: error instanceof Error ? error.message : String(error) });
      return;
    }

    if (repoState && !canWriteRepo(repoState, auth)) {
      await reply.code(403).send({ error: "Not authorized to push to this repository" });
      return;
    }
  } else if (repoState?.visibility === "private" && isUploadPackRequest) {
    try {
      auth = await parseDelegateAuth(config, request);
    } catch (error) {
      await reply.code(401).send({ error: error instanceof Error ? error.message : String(error) });
      return;
    }

    if (!canReadRepo(repoState, auth)) {
      await reply.code(403).send({ error: "Not authorized to read this repository" });
      return;
    }
  }

  let repoPath = await repositoryExists(config.repoRoot, repoRef.owner, repoRef.repo);
  if (!repoPath && isUploadPackRequest && repoState) {
    try {
      await restoreRepository(config, repoRef.owner, repoRef.repo, auth);
      repoPath = await assertRepositoryExists(config.repoRoot, repoRef.owner, repoRef.repo);
    } catch (error) {
      await reply.code(503).send({
        error: `Repository cache is unavailable and automatic restore failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      });
      return;
    }
  }

  if (!repoPath) {
    await reply.code(404).send({ error: "Repository not found" });
    return;
  }

  const beforeRefs = isReceivePack ? await listRefs(repoPath) : null;
  const body = await readRequestBody(request);
  const env = {
    ...process.env,
    GIT_HTTP_EXPORT_ALL: "1",
    GIT_PROJECT_ROOT: resolve(config.repoRoot),
    PATH_INFO: normalize(url.pathname),
    REQUEST_METHOD: request.method,
    QUERY_STRING: url.searchParams.toString(),
    CONTENT_TYPE: request.headers["content-type"] ?? "",
    CONTENT_LENGTH: String(body.length),
    REMOTE_ADDR: request.ip
  };

  const result = await runGit(["http-backend"], body, env);
  const { headers, body: responseBody } = splitCgiResponse(result.stdout);
  let statusCode = 200;

  for (const line of headers.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const separator = line.indexOf(":");
    if (separator < 0) {
      continue;
    }

    const name = line.slice(0, separator);
    const value = line.slice(separator + 1).trim();
    if (name.toLowerCase() === "status") {
      statusCode = Number.parseInt(value, 10) || statusCode;
      continue;
    }

    reply.header(name, value);
  }

  if (isReceivePack && statusCode >= 200 && statusCode < 300 && beforeRefs) {
    const afterRefs = await listRefs(repoPath);
    const refDeletions = deletedRefs(beforeRefs, afterRefs);
    try {
      const manifests = await createPushArtifacts({
        dataDir: config.dataDir,
        repoPath,
        owner: repoRef.owner,
        repo: repoRef.repo,
        beforeRefs,
        afterRefs,
        visibility: repoState?.visibility ?? "public",
        repoObjectId: repoState?.repoObjectId,
        packageId: config.suiPackageId,
        accountId: auth?.accountId,
        sealMode: config.sealMode,
        walrusNetwork: config.walrusNetwork,
        walrusUploadRelayUrl: config.walrusUploadRelayUrl,
        suiRpcUrl: config.suiRpcUrl,
        suiNetwork: config.suiNetwork,
        serverSuiPrivateKeys: config.serverSuiPrivateKeys,
        walrusOwnerAddress: repoState?.ownerWallet ?? auth?.walletAddress,
        sealServerConfigs: config.sealServerConfigs,
        sealKeyServers: config.sealKeyServers,
        sealThreshold: config.sealThreshold
      });
      if (manifests.length > 0 || refDeletions.length > 0) {
        const anchors = await anchorPushManifests(config, manifests, auth);
        const deletedAnchors = await anchorDeletedRefs(config, {
          owner: repoRef.owner,
          repo: repoRef.repo,
          deletions: refDeletions
        });
        await recordPushAttempt(config, {
          owner: repoRef.owner,
          repo: repoRef.repo,
          status: "completed",
          manifestIds: manifests.map((manifest) => manifest.manifestId),
          actor: auth?.walletAddress,
          createdAtMs: Date.now()
        });
        reply.header("x-octopus-manifest-count", String(manifests.length));
        reply.header("x-octopus-deleted-ref-count", String(deletedAnchors.length));
        reply.header("x-octopus-artifact-digest", manifests[0]?.artifactDigest ?? "");
        reply.header("x-octopus-anchor-count", String(anchors.length));
        reply.header("x-octopus-registry-mode", anchors[0]?.registryMode ?? deletedAnchors[0]?.registryMode ?? config.suiMode);
        const indexedState = await readSuiRepoState(config, repoRef.owner, repoRef.repo);
        if (indexedState) {
          indexRepository(config, indexedState).catch(() => undefined);
        }
      }
    } catch (error) {
      await recordPushAttempt(config, {
        owner: repoRef.owner,
        repo: repoRef.repo,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        actor: auth?.walletAddress,
        createdAtMs: Date.now()
      });
      throw error;
    }
  }

  await reply.code(statusCode).send(responseBody);
};
