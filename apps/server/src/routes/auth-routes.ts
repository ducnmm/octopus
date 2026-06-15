import { registerDelegateRequestSchema } from "@ducnmm/octopus-shared";
import type { FastifyInstance } from "fastify";
import { identityFromPrivateKey, registerLocalDelegate } from "../auth.js";
import { httpError } from "../lib/http-error.js";
import { normalizeReturnTo, requestOrigin } from "../lib/request-helpers.js";
import { clearWebSessionCookie, isRecord, setWebSessionCookie } from "../lib/web-session.js";
import { webSessionEntryFromRequest, webSessionFromRequest } from "../plugins/auth-context.js";
import type { RouteDeps } from "./index.js";

export const authRoutes = async (app: FastifyInstance, deps: RouteDeps) => {
  const { config, services, ctx } = deps;
  const isSecure = (request: Parameters<typeof ctx.serverOriginForRequest>[0]): boolean =>
    ctx.serverOriginForRequest(request).startsWith("https://");

  // /login is served by the SPA (history-API fallback); the panels fetch chain
  // configuration from /v1/auth/config instead of receiving it via redirect.

  app.post("/logout", async (request, reply) => {
    clearWebSessionCookie(reply, isSecure(request));
    const returnTo = normalizeReturnTo(request.headers.referer, requestOrigin(request));
    await reply.code(303).header("location", returnTo).send();
  });

  app.get<{ Querystring: { returnTo?: string } }>("/v1/auth/web-session/challenge", async (request, reply) => {
    const serverOrigin = ctx.serverOriginForRequest(request);
    const returnTo = normalizeReturnTo(request.query.returnTo, serverOrigin);
    const challenge = services.authService.issueWebSessionChallenge(serverOrigin, returnTo);
    await reply
      .header("cache-control", "no-store")
      .send({ nonce: challenge.nonce, message: challenge.message, expiresAtMs: challenge.expiresAtMs });
  });

  app.post("/v1/auth/web-session", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const { sessionId, session, returnTo } = await services.authService.verifyWebSessionChallenge({
      nonce: typeof body.nonce === "string" ? body.nonce : "",
      walletAddress: typeof body.walletAddress === "string" ? body.walletAddress : "",
      signature: typeof body.signature === "string" ? body.signature : "",
      accountId: typeof body.accountId === "string" ? body.accountId : undefined
    });

    setWebSessionCookie(reply, sessionId, session, config.webSessionSecret, isSecure(request));
    await reply.header("cache-control", "no-store").send({
      ok: true,
      accountId: session.accountId,
      walletAddress: session.walletAddress,
      expiresAtMs: session.expiresAtMs,
      returnTo
    });
  });

  app.get("/v1/auth/web-session", async (request, reply) => {
    const session = webSessionFromRequest(request);
    await reply.header("cache-control", "no-store").send(
      session
        ? {
            authenticated: true,
            accountId: session.accountId,
            walletAddress: session.walletAddress,
            unlockedRepoIds: [...session.unlockedRepoIds],
            expiresAtMs: session.expiresAtMs
          }
        : { authenticated: false }
    );
  });

  app.get<{ Params: { owner: string; repo: string }; Querystring: { returnTo?: string } }>(
    "/v1/repos/:owner/:repo/unlock/challenge",
    async (request, reply) => {
      const entry = webSessionEntryFromRequest(request);
      if (!entry) {
        throw httpError("Sign in with your wallet before unlocking this repository", 401);
      }

      const state = await ctx.authorizedRepoState(request, request.params.owner, request.params.repo);
      if (state.visibility === "public" || entry.session.unlockedRepoIds.has(state.repoId)) {
        await reply.header("cache-control", "no-store").send({ unlocked: true, repoId: state.repoId });
        return;
      }

      const serverOrigin = ctx.serverOriginForRequest(request);
      const returnTo = normalizeReturnTo(request.query.returnTo, serverOrigin);
      const challenge = services.authService.issueUnlockChallenge({
        serverOrigin,
        returnTo,
        repoId: state.repoId,
        sessionId: entry.sessionId
      });
      await reply.header("cache-control", "no-store").send({
        nonce: challenge.nonce,
        message: challenge.message,
        expiresAtMs: challenge.expiresAtMs,
        repoId: state.repoId
      });
    }
  );

  app.post<{ Params: { owner: string; repo: string } }>("/v1/repos/:owner/:repo/unlock", async (request, reply) => {
    const entry = webSessionEntryFromRequest(request);
    if (!entry) {
      throw httpError("Sign in with your wallet before unlocking this repository", 401);
    }

    const state = await ctx.authorizedRepoState(request, request.params.owner, request.params.repo);
    const body = isRecord(request.body) ? request.body : {};
    const nonce = typeof body.nonce === "string" ? body.nonce : "";
    const signature = typeof body.signature === "string" ? body.signature : "";
    if (!nonce || !signature) {
      throw httpError("Missing repository unlock signature payload", 400);
    }

    const { returnTo } = await services.authService.verifyUnlock({
      nonce,
      signature,
      sessionId: entry.sessionId,
      walletAddress: entry.session.walletAddress,
      repoId: state.repoId
    });

    entry.session.unlockedRepoIds.add(state.repoId);
    setWebSessionCookie(reply, entry.sessionId, entry.session, config.webSessionSecret, isSecure(request));
    await reply.header("cache-control", "no-store").send({ ok: true, repoId: state.repoId, returnTo });
  });

  app.get("/v1/auth/config", async () => {
    const serverDelegate = config.serverSuiPrivateKeys[0]
      ? identityFromPrivateKey(config.serverSuiPrivateKeys[0])
      : null;

    return {
      suiMode: config.suiMode,
      suiNetwork: config.suiNetwork,
      suiRpcUrl: config.suiRpcUrl,
      webUrl: config.webUrl,
      packageId: config.suiPackageId,
      accountRegistryId: config.accountRegistryId,
      repoRegistryId: config.repoRegistryId,
      serverDelegatePublicKey: serverDelegate?.delegatePublicKey,
      serverDelegateAddress: serverDelegate?.delegateAddress,
      enokiSponsoredTransactions: services.enokiService.isEnabled()
    };
  });

  app.post("/v1/auth/delegate", async (request, reply) => {
    if (config.suiMode !== "local") {
      await reply.code(409).send({ error: "Delegate keys must be registered on Sui in testnet mode" });
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
};
