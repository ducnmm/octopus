import { mkdir } from "node:fs/promises";
import Fastify from "fastify";
import { createRepoRequestSchema, delegateAuthHeaders, registerDelegateRequestSchema } from "@octopus/shared";
import { readRepoManifests } from "./artifacts.js";
import { identityFromPrivateKey, parseDelegateAuth, registerLocalDelegate, redactDelegateSecrets } from "./auth.js";
import type { ServerConfig } from "./config.js";
import { handleGitHttp, initBareRepository } from "./git.js";
import { restoreRepository } from "./restore.js";
import { canReadRepo, ensureSuiRepo, listSuiRepoStates, readSuiRepoState } from "./sui.js";
import { renderRepoListPage, toRepoListItem } from "./web.js";

const hasDelegateAuth = (request: { headers: Record<string, unknown> }): boolean => {
  return Boolean(
    request.headers[delegateAuthHeaders.token] ||
      request.headers[delegateAuthHeaders.delegateKey] ||
      request.headers[delegateAuthHeaders.accountId]
  );
};

export const buildServer = (config: ServerConfig) => {
  const app = Fastify({
    logger: {
      redact: [
        "req.headers.x-octopus-delegate-key",
        "headers.x-octopus-delegate-key",
        "req.headers.x-octopus-auth-token",
        "headers.x-octopus-auth-token"
      ]
    },
    bodyLimit: 1024 * 1024 * 200
  });

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    reply.header("access-control-allow-origin", origin ?? "*");
    reply.header("vary", "Origin");
    reply.header("access-control-allow-methods", "GET,POST,OPTIONS");
    reply.header(
      "access-control-allow-headers",
      "content-type,x-octopus-auth-token,x-octopus-delegate-key,x-octopus-account-id"
    );

    if (request.method === "OPTIONS") {
      await reply.code(204).send();
    }
  });

  app.setErrorHandler(async (error, _request, reply) => {
    const nextError = error instanceof Error ? error : new Error(String(error));
    const statusCode = typeof (nextError as Error & { statusCode?: unknown }).statusCode === "number"
      ? (nextError as Error & { statusCode: number }).statusCode
      : 500;
    const message = redactDelegateSecrets(nextError.message);
    await reply.code(statusCode).send({ error: message });
  });

  app.addContentTypeParser(
    /^application\/x-git-.*/,
    { parseAs: "buffer" },
    (_request, body, done) => {
      done(null, body);
    }
  );

  app.get("/healthz", async () => ({
    ok: true,
    service: "octopus-server"
  }));

  const visibleRepoItems = async (request: { headers: Record<string, unknown> }) => {
    const states = await listSuiRepoStates(config);
    let auth = null;

    if (hasDelegateAuth(request)) {
      try {
        auth = await parseDelegateAuth(config, request as never);
      } catch (error) {
        const nextError = new Error(error instanceof Error ? error.message : String(error)) as Error & {
          statusCode: number;
        };
        nextError.statusCode = 401;
        throw nextError;
      }
    }

    return states.filter((state) => canReadRepo(state, auth)).map(toRepoListItem);
  };

  app.get("/", async (request, reply) => {
    const repos = await visibleRepoItems(request);
    await reply.type("text/html; charset=utf-8").send(renderRepoListPage(repos));
  });

  app.get("/v1/repos", async (request) => {
    return {
      repos: await visibleRepoItems(request)
    };
  });

  app.get("/v1/auth/config", async () => {
    const serverDelegate = config.serverSuiPrivateKeys[0]
      ? identityFromPrivateKey(config.serverSuiPrivateKeys[0])
      : null;

    return {
      suiMode: config.suiMode,
      suiNetwork: config.suiNetwork,
      suiRpcUrl: config.suiRpcUrl,
      packageId: config.suiPackageId,
      accountRegistryId: config.accountRegistryId,
      repoRegistryId: config.repoRegistryId,
      serverDelegatePublicKey: serverDelegate?.delegatePublicKey,
      serverDelegateAddress: serverDelegate?.delegateAddress
    };
  });

  app.post("/v1/auth/delegate", async (request, reply) => {
    if (config.suiMode !== "local") {
      await reply.code(409).send({
        error: "Delegate keys must be registered on Sui in testnet mode"
      });
      return;
    }

    const input = registerDelegateRequestSchema.parse(request.body);
    const account = await registerLocalDelegate(config, input);
    await reply.code(201).send({
      accountId: account.accountId,
      walletAddress: account.walletAddress,
      delegateCount: account.delegateKeys.length
    });
  });

  app.post("/v1/repos", async (request, reply) => {
    const auth = await parseDelegateAuth(config, request);
    const input = createRepoRequestSchema.parse(request.body);
    await mkdir(config.repoRoot, { recursive: true });
    await initBareRepository(config.repoRoot, input.owner, input.name);
    const suiRepo = await ensureSuiRepo(config, {
      owner: input.owner,
      repo: input.name,
      visibility: input.visibility,
      accountId: auth.accountId,
      ownerWallet: auth.walletAddress
    }, auth);

    await reply.code(201).send({
      owner: input.owner,
      name: input.name,
      visibility: input.visibility,
      gitRemotePath: `/${input.owner}/${input.name}.git`,
      registryMode: suiRepo.registryMode,
      repoObjectId: suiRepo.repoObjectId
    });
  });

  app.post<{
    Params: {
      owner: string;
      repo: string;
    };
  }>("/v1/repos/:owner/:repo/restore", async (request, reply) => {
    const state = await readSuiRepoState(config, request.params.owner, request.params.repo);
    let auth = null;
    if (state?.visibility === "private") {
      try {
        auth = await parseDelegateAuth(config, request);
      } catch (error) {
        await reply.code(401).send({ error: error instanceof Error ? error.message : String(error) });
        return;
      }
    }
    if (state && !canReadRepo(state, auth)) {
      await reply.code(403).send({ error: "Not authorized to restore this repository" });
      return;
    }

    const result = await restoreRepository(config, request.params.owner, request.params.repo, auth);
    await reply.code(200).send(result);
  });

  app.get<{
    Params: {
      owner: string;
      repo: string;
    };
  }>("/v1/repos/:owner/:repo/manifests", async (request) => {
    const state = await readSuiRepoState(config, request.params.owner, request.params.repo);
    if (state?.visibility === "private") {
      let auth = null;
      try {
        auth = await parseDelegateAuth(config, request);
      } catch (error) {
        const nextError = new Error(error instanceof Error ? error.message : String(error)) as Error & {
          statusCode: number;
        };
        nextError.statusCode = 401;
        throw nextError;
      }
      if (!canReadRepo(state, auth)) {
        const error = new Error("Not authorized to list manifests for this repository") as Error & {
          statusCode: number;
        };
        error.statusCode = 403;
        throw error;
      }
    }

    return {
      manifests: await readRepoManifests(config.dataDir, request.params.owner, request.params.repo)
    };
  });

  app.all("/*", async (request, reply) => {
    if (request.url.includes(".git")) {
      await handleGitHttp(request, reply, config);
      return;
    }

    await reply.code(404).send({ error: "Not found" });
  });

  return app;
};
