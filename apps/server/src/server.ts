import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { createRepoRequestSchema, delegateAuthHeaders, registerDelegateRequestSchema } from "@octopus/shared";
import { readRepoManifests } from "./artifacts.js";
import {
  identityFromPrivateKey,
  parseDelegateAuth,
  registerLocalDelegate,
  redactDelegateSecrets,
  type AuthContext
} from "./auth.js";
import type { ServerConfig } from "./config.js";
import { handleGitHttp, initBareRepository } from "./git.js";
import { bareRepoPath } from "./git.js";
import { ensureRepoIndex, indexRepository, readBlob, readCommits, readTree } from "./indexer.js";
import { resolveRepoOwnerNamespace } from "./namespace.js";
import { restoreRepository } from "./restore.js";
import { canReadRepo, canWriteRepo, ensureSuiRepo, listSuiRepoStates, readSuiRepoState, type SuiRepoState } from "./sui.js";
import {
  renderBlobPage,
  renderCommitsPage,
  renderDashboardPage,
  renderPrivateRepoLoginPage,
  renderPrivateRepoUnlockPage,
  renderProfilePage,
  renderRepoPage,
  toRepoListItem,
  type WebViewer
} from "./web.js";

const underwaterBackgroundAsset = new URL("../assets/octopus-underwater-bg.png", import.meta.url);
const underwaterBackgroundDarkAsset = new URL("../assets/octopus-underwater-bg-dark.png", import.meta.url);
const staticAssetRoutes = [
  {
    path: "/favicon.ico",
    source: new URL("../assets/favicon/favicon.ico", import.meta.url),
    type: "image/x-icon"
  },
  {
    path: "/favicon-16x16.png",
    source: new URL("../assets/favicon/favicon-16x16.png", import.meta.url),
    type: "image/png"
  },
  {
    path: "/favicon-32x32.png",
    source: new URL("../assets/favicon/favicon-32x32.png", import.meta.url),
    type: "image/png"
  },
  {
    path: "/apple-touch-icon.png",
    source: new URL("../assets/favicon/apple-touch-icon.png", import.meta.url),
    type: "image/png"
  },
  {
    path: "/android-chrome-192x192.png",
    source: new URL("../assets/favicon/android-chrome-192x192.png", import.meta.url),
    type: "image/png"
  },
  {
    path: "/android-chrome-512x512.png",
    source: new URL("../assets/favicon/android-chrome-512x512.png", import.meta.url),
    type: "image/png"
  },
  {
    path: "/site.webmanifest",
    source: new URL("../assets/favicon/site.webmanifest", import.meta.url),
    type: "application/manifest+json"
  }
] as const;

const hasDelegateAuth = (request: { headers: Record<string, unknown> }): boolean => {
  return Boolean(
    request.headers[delegateAuthHeaders.token] ||
      request.headers[delegateAuthHeaders.delegateKey] ||
      request.headers[delegateAuthHeaders.accountId]
  );
};

const originFromUrl = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const isLoopbackHost = (host: string): boolean => {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
};

const isAllowedCorsOrigin = (origin: unknown, config: ServerConfig): origin is string => {
  if (typeof origin !== "string") {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  const configuredWebOrigin = originFromUrl(config.webUrl);
  if (configuredWebOrigin && parsed.origin === configuredWebOrigin) {
    return true;
  }

  if (configuredWebOrigin) {
    const configured = new URL(configuredWebOrigin);
    return isLoopbackHost(configured.hostname) && isLoopbackHost(parsed.hostname);
  }

  return false;
};

const webSessionCookieName = "octopus_web_session";
const webSessionTtlMs = 12 * 60 * 60 * 1000;
const webChallengeTtlMs = 5 * 60 * 1000;
const repoUnlockChallengeTtlMs = 5 * 60 * 1000;

type WebChallenge = {
  message: string;
  returnTo: string;
  expiresAtMs: number;
};

type WebSession = {
  accountId: string;
  walletAddress: string;
  unlockedRepoIds: Set<string>;
  createdAtMs: number;
  expiresAtMs: number;
};

type RepoUnlockChallenge = WebChallenge & {
  repoId: string;
  sessionId: string;
};

const webChallenges = new Map<string, WebChallenge>();
const repoUnlockChallenges = new Map<string, RepoUnlockChallenge>();
const webSessions = new Map<string, WebSession>();

const webAccountId = (walletAddress: string): string => {
  const digest = createHash("sha256").update(walletAddress.toLowerCase()).digest("hex").slice(0, 40);
  return `web:${digest}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

const parseCookies = (request: FastifyRequest): Record<string, string> => {
  const raw = request.headers.cookie;
  const header = Array.isArray(raw) ? raw.join(";") : raw ?? "";
  const cookies: Record<string, string> = {};

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!key) {
      continue;
    }
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }

  return cookies;
};

const cleanupWebAuth = (): void => {
  const now = Date.now();
  for (const [nonce, challenge] of webChallenges) {
    if (challenge.expiresAtMs <= now) {
      webChallenges.delete(nonce);
    }
  }
  for (const [nonce, challenge] of repoUnlockChallenges) {
    if (challenge.expiresAtMs <= now) {
      repoUnlockChallenges.delete(nonce);
    }
  }
  for (const [sessionId, session] of webSessions) {
    if (session.expiresAtMs <= now) {
      webSessions.delete(sessionId);
    }
  }
};

const webSessionEntryFromRequest = (request: FastifyRequest): { sessionId: string; session: WebSession } | null => {
  cleanupWebAuth();
  const sessionId = parseCookies(request)[webSessionCookieName];
  if (!sessionId) {
    return null;
  }

  const session = webSessions.get(sessionId);
  if (!session || session.expiresAtMs <= Date.now()) {
    webSessions.delete(sessionId);
    return null;
  }

  return { sessionId, session };
};

const webSessionFromRequest = (request: FastifyRequest): WebSession | null => {
  return webSessionEntryFromRequest(request)?.session ?? null;
};

const authFromWebSession = (session: WebSession): AuthContext => ({
  accountId: session.accountId,
  walletAddress: session.walletAddress,
  delegatePublicKey: "web-session",
  delegateAddress: session.walletAddress,
  source: "web"
});

const webViewerFromRequest = (request: FastifyRequest): WebViewer => {
  const session = webSessionFromRequest(request);
  return session ? { walletAddress: session.walletAddress } : null;
};

const setWebSessionCookie = (
  reply: FastifyReply,
  sessionId: string,
  expiresAtMs: number,
  secure: boolean
): void => {
  const maxAge = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
  const secureAttr = secure ? "; Secure" : "";
  reply.header(
    "set-cookie",
    `${webSessionCookieName}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureAttr}`
  );
};

const clearWebSessionCookie = (reply: FastifyReply, secure: boolean): void => {
  const secureAttr = secure ? "; Secure" : "";
  reply.header("set-cookie", `${webSessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureAttr}`);
};

export const buildServer = (config: ServerConfig) => {
  const app = Fastify({
    logger: {
      redact: [
        "req.headers.x-octopus-delegate-key",
        "headers.x-octopus-delegate-key",
        "req.headers.x-octopus-auth-token",
        "headers.x-octopus-auth-token",
        "req.headers.cookie",
        "headers.cookie"
      ]
    },
    bodyLimit: 1024 * 1024 * 200
  });

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    reply.header("vary", "Origin");
    const allowCors = isAllowedCorsOrigin(origin, config);
    if (allowCors) {
      reply.header("access-control-allow-origin", new URL(origin).origin);
      reply.header("access-control-allow-credentials", "true");
      reply.header("access-control-allow-methods", "GET,POST,OPTIONS");
      reply.header(
        "access-control-allow-headers",
        "content-type,x-octopus-auth-token,x-octopus-delegate-key,x-octopus-account-id"
      );
    }

    if (request.method === "OPTIONS") {
      if (origin && !allowCors) {
        await reply.code(403).send();
        return;
      }
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

  app.get("/assets/octopus-underwater-bg.png", async (_request, reply) => {
    const image = await readFile(underwaterBackgroundAsset);
    await reply
      .header("cache-control", "public, max-age=31536000, immutable")
      .type("image/png")
      .send(image);
  });

  app.get("/assets/octopus-underwater-bg-dark.png", async (_request, reply) => {
    const image = await readFile(underwaterBackgroundDarkAsset);
    await reply
      .header("cache-control", "public, max-age=31536000, immutable")
      .type("image/png")
      .send(image);
  });

  for (const asset of staticAssetRoutes) {
    app.get(asset.path, async (_request, reply) => {
      const data = await readFile(asset.source);
      await reply
        .header("cache-control", "public, max-age=31536000, immutable")
        .type(asset.type)
        .send(data);
    });
  }

  const requestAuthContext = async (request: FastifyRequest): Promise<AuthContext | null> => {
    if (hasDelegateAuth(request)) {
      try {
        return await parseDelegateAuth(config, request);
      } catch (error) {
        const nextError = new Error(error instanceof Error ? error.message : String(error)) as Error & {
          statusCode: number;
        };
        nextError.statusCode = 401;
        throw nextError;
      }
    }

    const session = webSessionFromRequest(request);
    return session ? authFromWebSession(session) : null;
  };

  const visibleRepoItems = async (request: FastifyRequest) => {
    const states = await listSuiRepoStates(config);
    const auth = await requestAuthContext(request);

    return await Promise.all(states.filter((state) => canReadRepo(state, auth)).map(async (state) => {
      const item = toRepoListItem(state);
      try {
        const index = await ensureRepoIndex(config, state);
        return {
          ...item,
          commitCount: index.commitCount,
          commitDates: index.commits.map((commit) => commit.authoredAt)
        };
      } catch {
        return item;
      }
    }));
  };

  const authorizedRepoState = async (
    request: FastifyRequest,
    owner: string,
    repo: string
  ): Promise<SuiRepoState> => {
    const state = await readSuiRepoState(config, owner, repo);
    if (!state) {
      const error = new Error("Repository state not found") as Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    }

    if (state.visibility === "private") {
      const auth = await requestAuthContext(request);

      if (!canReadRepo(state, auth)) {
        const error = new Error("Not authorized to read this repository") as Error & { statusCode: number };
        error.statusCode = auth ? 403 : 401;
        throw error;
      }
    }

    return state;
  };

  const queryString = (value: unknown): string | undefined => {
    return typeof value === "string" && value.trim() ? value : undefined;
  };

  const queryInt = (value: unknown, fallback: number): number => {
    if (typeof value !== "string") {
      return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  };

  const requestOrigin = (request: { headers: Record<string, unknown>; protocol?: string }): string | undefined => {
    const forwardedProto = request.headers["x-forwarded-proto"];
    const forwardedHost = request.headers["x-forwarded-host"];
    const host = typeof forwardedHost === "string"
      ? forwardedHost.split(",")[0]?.trim()
      : typeof request.headers.host === "string"
        ? request.headers.host
        : undefined;
    if (!host) {
      return undefined;
    }
    const protocol = typeof forwardedProto === "string"
      ? forwardedProto.split(",")[0]?.trim()
      : request.protocol ?? "http";
    return `${protocol || "http"}://${host}`;
  };

  const httpError = (message: string, statusCode: number): Error & { statusCode: number } => {
    const error = new Error(message) as Error & { statusCode: number };
    error.statusCode = statusCode;
    return error;
  };

  const normalizeReturnTo = (value: unknown, origin?: string): string => {
    const text = typeof value === "string" && value.trim() ? value.trim() : "/";
    if (text.startsWith("/") && !text.startsWith("//")) {
      return text;
    }

    try {
      const base = origin ?? "http://127.0.0.1";
      const url = new URL(text, base);
      if (!origin || url.origin === origin) {
        return `${url.pathname}${url.search}${url.hash}`;
      }
    } catch {
      return "/";
    }

    return "/";
  };

  const serverOriginForRequest = (request: FastifyRequest): string => {
    return requestOrigin(request) ?? `http://${config.host}:${config.port}`;
  };

  const webLoginUrl = (
    request: FastifyRequest,
    returnToInput?: unknown,
    options: { embedded?: boolean } = {}
  ): string => {
    const serverOrigin = serverOriginForRequest(request);
    const url = new URL("/login", config.webUrl);
    url.searchParams.set("mode", "web");
    url.searchParams.set("server", serverOrigin);
    url.searchParams.set("returnTo", normalizeReturnTo(returnToInput, serverOrigin));
    url.searchParams.set("autostart", "1");
    if (options.embedded) {
      url.searchParams.set("embed", "1");
    }
    return url.toString();
  };

  const webUnlockUrl = (request: FastifyRequest, state: SuiRepoState, returnToInput?: unknown): string => {
    const serverOrigin = serverOriginForRequest(request);
    const url = new URL("/login", config.webUrl);
    url.searchParams.set("mode", "unlock");
    url.searchParams.set("server", serverOrigin);
    url.searchParams.set("owner", state.owner);
    url.searchParams.set("repo", state.repo);
    url.searchParams.set("returnTo", normalizeReturnTo(returnToInput, serverOrigin));
    url.searchParams.set("autostart", "1");
    return url.toString();
  };

  const repoContentUnlocked = (request: FastifyRequest, state: SuiRepoState): boolean => {
    if (state.visibility === "public" || hasDelegateAuth(request)) {
      return true;
    }

    return Boolean(webSessionEntryFromRequest(request)?.session.unlockedRepoIds.has(state.repoId));
  };

  const requireRepoContentAccess = (request: FastifyRequest, state: SuiRepoState): void => {
    if (repoContentUnlocked(request, state)) {
      return;
    }

    const error = new Error("Repository content is locked. Unlock this repository with your wallet first.") as Error & {
      statusCode: number;
    };
    error.statusCode = webSessionEntryFromRequest(request) ? 423 : 401;
    throw error;
  };

  const authorizedHtmlRepoState = async (
    request: FastifyRequest<{ Params: { owner: string; repo: string } }>,
    reply: FastifyReply
  ): Promise<SuiRepoState | null> => {
    try {
      return await authorizedRepoState(request, request.params.owner, request.params.repo);
    } catch (error) {
      const statusCode = typeof (error as Error & { statusCode?: unknown }).statusCode === "number"
        ? (error as Error & { statusCode: number }).statusCode
        : 500;
      const state = await readSuiRepoState(config, request.params.owner, request.params.repo);
      if ((statusCode === 401 || statusCode === 403) && state?.visibility === "private") {
        await reply.code(statusCode).type("text/html; charset=utf-8").send(renderPrivateRepoLoginPage({
          repo: toRepoListItem(state),
          viewer: webViewerFromRequest(request),
          loginHref: webLoginUrl(request, request.url),
          message: statusCode === 403
            ? "This wallet does not have access to this private repository."
            : "Sign in with your Sui wallet to view this private repository."
        }));
        return null;
      }
      throw error;
    }
  };

  const authorizedHtmlRepoContentState = async (
    request: FastifyRequest<{ Params: { owner: string; repo: string } }>,
    reply: FastifyReply
  ): Promise<SuiRepoState | null> => {
    const state = await authorizedHtmlRepoState(request, reply);
    if (!state) {
      return null;
    }

    try {
      requireRepoContentAccess(request, state);
      return state;
    } catch (error) {
      const statusCode = typeof (error as Error & { statusCode?: unknown }).statusCode === "number"
        ? (error as Error & { statusCode: number }).statusCode
        : 500;
      if (statusCode === 423 || statusCode === 401) {
        const viewer = webViewerFromRequest(request);
        await reply.code(statusCode).type("text/html; charset=utf-8").send(viewer
          ? renderPrivateRepoUnlockPage({
              repo: toRepoListItem(state),
              viewer,
              unlockHref: webUnlockUrl(request, state, request.url),
              message: "Unlock this repository with your wallet before viewing files, commits, or blobs."
            })
          : renderPrivateRepoLoginPage({
              repo: toRepoListItem(state),
              viewer,
              loginHref: webLoginUrl(request, request.url),
              message: "Sign in with your Sui wallet before unlocking this private repository."
            }));
        return null;
      }
      throw error;
    }
  };

  app.get<{
    Querystring: { returnTo?: string; embed?: string };
  }>("/login", async (request, reply) => {
    await reply
      .code(302)
      .header("location", webLoginUrl(request, request.query.returnTo ?? request.headers.referer, {
        embedded: request.query.embed === "1"
      }))
      .send();
  });

  app.post("/logout", async (request, reply) => {
    const sessionId = parseCookies(request)[webSessionCookieName];
    if (sessionId) {
      webSessions.delete(sessionId);
    }

    clearWebSessionCookie(reply, serverOriginForRequest(request).startsWith("https://"));
    const returnTo = normalizeReturnTo(request.headers.referer, requestOrigin(request));
    await reply.code(303).header("location", returnTo).send();
  });

  app.get("/", async (request, reply) => {
    const repos = await visibleRepoItems(request);
    await reply.type("text/html; charset=utf-8").send(renderDashboardPage(repos, webViewerFromRequest(request)));
  });

  app.get("/v1/repos", async (request) => {
    return {
      repos: await visibleRepoItems(request)
    };
  });

  app.get<{
    Params: { owner: string };
  }>("/:owner", async (request, reply) => {
    const repos = (await visibleRepoItems(request)).filter((repo) => repo.owner === request.params.owner);
    await reply.type("text/html; charset=utf-8").send(renderProfilePage(request.params.owner, repos, webViewerFromRequest(request)));
  });

  app.get<{
    Params: { owner: string; repo: string };
  }>("/v1/repos/:owner/:repo/index", async (request) => {
    const state = await authorizedRepoState(request, request.params.owner, request.params.repo);
    requireRepoContentAccess(request, state);
    return {
      index: await ensureRepoIndex(config, state)
    };
  });

  app.post<{
    Params: { owner: string; repo: string };
  }>("/v1/repos/:owner/:repo/index", async (request, reply) => {
    const state = await authorizedRepoState(request, request.params.owner, request.params.repo);
    requireRepoContentAccess(request, state);
    await reply.code(202).send({
      index: await indexRepository(config, state)
    });
  });

  app.get<{
    Params: { owner: string; repo: string };
    Querystring: { ref?: string; limit?: string };
  }>("/v1/repos/:owner/:repo/commits", async (request) => {
    const state = await authorizedRepoState(request, request.params.owner, request.params.repo);
    requireRepoContentAccess(request, state);
    const ref = queryString(request.query.ref) ?? state.defaultBranch;
    const limit = Math.max(1, Math.min(queryInt(request.query.limit, 50), 500));
    const index = await ensureRepoIndex(config, state);
    const repoPath = bareRepoPath(config.repoRoot, state.owner, state.repo);
    return {
      repoId: state.repoId,
      ref,
      indexedAtMs: index.indexedAtMs,
      commits: await readCommits(repoPath, ref, limit)
    };
  });

  app.get<{
    Params: { owner: string; repo: string };
    Querystring: { ref?: string; path?: string };
  }>("/v1/repos/:owner/:repo/tree", async (request) => {
    const state = await authorizedRepoState(request, request.params.owner, request.params.repo);
    requireRepoContentAccess(request, state);
    const ref = queryString(request.query.ref) ?? state.defaultBranch;
    const path = request.query.path ?? "";
    const index = await ensureRepoIndex(config, state);
    const repoPath = bareRepoPath(config.repoRoot, state.owner, state.repo);
    return {
      repoId: state.repoId,
      ref,
      path,
      indexedAtMs: index.indexedAtMs,
      entries: await readTree(repoPath, ref, path)
    };
  });

  app.get<{
    Params: { owner: string; repo: string };
    Querystring: { ref?: string; path?: string };
  }>("/v1/repos/:owner/:repo/blob", async (request) => {
    const state = await authorizedRepoState(request, request.params.owner, request.params.repo);
    requireRepoContentAccess(request, state);
    const ref = queryString(request.query.ref) ?? state.defaultBranch;
    const path = queryString(request.query.path);
    if (!path) {
      const error = new Error("File path is required") as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }
    const index = await ensureRepoIndex(config, state);
    const repoPath = bareRepoPath(config.repoRoot, state.owner, state.repo);
    return {
      repoId: state.repoId,
      ref,
      indexedAtMs: index.indexedAtMs,
      file: await readBlob(repoPath, ref, path)
    };
  });

  app.get<{
    Querystring: { returnTo?: string };
  }>("/v1/auth/web-session/challenge", async (request, reply) => {
    cleanupWebAuth();
    const now = Date.now();
    const expiresAtMs = now + webChallengeTtlMs;
    const nonce = randomBytes(24).toString("base64url");
    const serverOrigin = serverOriginForRequest(request);
    const returnTo = normalizeReturnTo(request.query.returnTo, serverOrigin);
    const message = [
      "Octopus web session",
      "Version: 1",
      `Server: ${serverOrigin}`,
      `Nonce: ${nonce}`,
      `Issued at: ${new Date(now).toISOString()}`,
      `Expires at: ${new Date(expiresAtMs).toISOString()}`,
      `Return to: ${returnTo}`
    ].join("\n");

    webChallenges.set(nonce, {
      message,
      returnTo,
      expiresAtMs
    });

    await reply.header("cache-control", "no-store").send({
      nonce,
      message,
      expiresAtMs
    });
  });

  app.post("/v1/auth/web-session", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const nonce = typeof body.nonce === "string" ? body.nonce : "";
    const walletAddress = typeof body.walletAddress === "string" ? body.walletAddress.trim().toLowerCase() : "";
    const accountId = typeof body.accountId === "string" && body.accountId.trim()
      ? body.accountId.trim()
      : webAccountId(walletAddress);
    const signature = typeof body.signature === "string" ? body.signature : "";

    if (!nonce || !walletAddress || !signature) {
      throw httpError("Missing web session signature payload", 400);
    }

    cleanupWebAuth();
    const challenge = webChallenges.get(nonce);
    webChallenges.delete(nonce);
    if (!challenge || challenge.expiresAtMs <= Date.now()) {
      throw httpError("Web session challenge expired", 401);
    }

    try {
      await verifyPersonalMessageSignature(Buffer.from(challenge.message, "utf8"), signature, {
        address: walletAddress
      });
    } catch {
      throw httpError("Invalid web session signature", 401);
    }

    const sessionId = randomBytes(32).toString("base64url");
    const now = Date.now();
    const session: WebSession = {
      accountId,
      walletAddress,
      unlockedRepoIds: new Set(),
      createdAtMs: now,
      expiresAtMs: now + webSessionTtlMs
    };
    webSessions.set(sessionId, session);
    setWebSessionCookie(reply, sessionId, session.expiresAtMs, serverOriginForRequest(request).startsWith("https://"));

    await reply.header("cache-control", "no-store").send({
      ok: true,
      accountId: session.accountId,
      walletAddress: session.walletAddress,
      expiresAtMs: session.expiresAtMs,
      returnTo: challenge.returnTo
    });
  });

  app.get("/v1/auth/web-session", async (request, reply) => {
    const session = webSessionFromRequest(request);
    await reply.header("cache-control", "no-store").send(session
      ? {
          authenticated: true,
          accountId: session.accountId,
          walletAddress: session.walletAddress,
          unlockedRepoIds: [...session.unlockedRepoIds],
          expiresAtMs: session.expiresAtMs
        }
      : {
          authenticated: false
        });
  });

  app.get<{
    Params: { owner: string; repo: string };
    Querystring: { returnTo?: string };
  }>("/v1/repos/:owner/:repo/unlock/challenge", async (request, reply) => {
    const entry = webSessionEntryFromRequest(request);
    if (!entry) {
      throw httpError("Sign in with your wallet before unlocking this repository", 401);
    }

    const state = await authorizedRepoState(request, request.params.owner, request.params.repo);
    if (state.visibility === "public" || entry.session.unlockedRepoIds.has(state.repoId)) {
      await reply.header("cache-control", "no-store").send({
        unlocked: true,
        repoId: state.repoId
      });
      return;
    }

    const now = Date.now();
    const expiresAtMs = now + repoUnlockChallengeTtlMs;
    const nonce = randomBytes(24).toString("base64url");
    const serverOrigin = serverOriginForRequest(request);
    const returnTo = normalizeReturnTo(request.query.returnTo, serverOrigin);
    const message = [
      "Octopus private repository unlock",
      "Version: 1",
      `Server: ${serverOrigin}`,
      `Repository: ${state.repoId}`,
      `Nonce: ${nonce}`,
      `Issued at: ${new Date(now).toISOString()}`,
      `Expires at: ${new Date(expiresAtMs).toISOString()}`,
      `Return to: ${returnTo}`
    ].join("\n");

    repoUnlockChallenges.set(nonce, {
      message,
      returnTo,
      expiresAtMs,
      repoId: state.repoId,
      sessionId: entry.sessionId
    });

    await reply.header("cache-control", "no-store").send({
      nonce,
      message,
      expiresAtMs,
      repoId: state.repoId
    });
  });

  app.post<{
    Params: { owner: string; repo: string };
  }>("/v1/repos/:owner/:repo/unlock", async (request, reply) => {
    const entry = webSessionEntryFromRequest(request);
    if (!entry) {
      throw httpError("Sign in with your wallet before unlocking this repository", 401);
    }

    const state = await authorizedRepoState(request, request.params.owner, request.params.repo);
    const body = isRecord(request.body) ? request.body : {};
    const nonce = typeof body.nonce === "string" ? body.nonce : "";
    const signature = typeof body.signature === "string" ? body.signature : "";
    if (!nonce || !signature) {
      throw httpError("Missing repository unlock signature payload", 400);
    }

    cleanupWebAuth();
    const challenge = repoUnlockChallenges.get(nonce);
    repoUnlockChallenges.delete(nonce);
    if (
      !challenge ||
      challenge.expiresAtMs <= Date.now() ||
      challenge.sessionId !== entry.sessionId ||
      challenge.repoId !== state.repoId
    ) {
      throw httpError("Repository unlock challenge expired", 401);
    }

    try {
      await verifyPersonalMessageSignature(Buffer.from(challenge.message, "utf8"), signature, {
        address: entry.session.walletAddress
      });
    } catch {
      throw httpError("Invalid repository unlock signature", 401);
    }

    entry.session.unlockedRepoIds.add(state.repoId);
    await reply.header("cache-control", "no-store").send({
      ok: true,
      repoId: state.repoId,
      returnTo: challenge.returnTo
    });
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
    const owner = await resolveRepoOwnerNamespace(config, auth, input.owner);
    await mkdir(config.repoRoot, { recursive: true });
    await initBareRepository(config.repoRoot, owner, input.name);
    const suiRepo = await ensureSuiRepo(config, {
      owner,
      repo: input.name,
      visibility: input.visibility,
      accountId: auth.accountId,
      ownerWallet: auth.walletAddress
    }, auth);

    await reply.code(201).send({
      owner,
      name: input.name,
      visibility: input.visibility,
      gitRemotePath: `/${owner}/${input.name}.git`,
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
    let auth: AuthContext;
    try {
      auth = await parseDelegateAuth(config, request);
    } catch (error) {
      await reply.code(401).send({ error: error instanceof Error ? error.message : String(error) });
      return;
    }
    if (state && !canWriteRepo(state, auth)) {
      await reply.code(403).send({ error: "Not authorized to restore this repository" });
      return;
    }

    const result = await restoreRepository(config, request.params.owner, request.params.repo, auth);
    const restoredState = await readSuiRepoState(config, request.params.owner, request.params.repo);
    if (restoredState) {
      await indexRepository(config, restoredState);
    }
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
      const auth = await requestAuthContext(request);
      if (!canReadRepo(state, auth)) {
        const error = new Error("Not authorized to list manifests for this repository") as Error & {
          statusCode: number;
        };
        error.statusCode = auth ? 403 : 401;
        throw error;
      }
    }

    return {
      manifests: await readRepoManifests(config.dataDir, request.params.owner, request.params.repo)
    };
  });

  app.get<{
    Params: { owner: string; repo: string };
    Querystring: { ref?: string; path?: string };
  }>("/:owner/:repo", async (request, reply) => {
    const state = await authorizedHtmlRepoContentState(request, reply);
    if (!state) {
      return;
    }
    const index = await ensureRepoIndex(config, state);
    const ref = queryString(request.query.ref) ?? state.defaultBranch;
    const path = request.query.path ?? "";
    const repoPath = bareRepoPath(config.repoRoot, state.owner, state.repo);
    await reply.type("text/html; charset=utf-8").send(renderRepoPage({
      repo: toRepoListItem(state),
      index,
      commits: await readCommits(repoPath, ref, 25),
      tree: await readTree(repoPath, ref, path),
      ref,
      path,
      origin: requestOrigin(request),
      viewer: webViewerFromRequest(request)
    }));
  });

  app.get<{
    Params: { owner: string; repo: string };
    Querystring: { ref?: string; limit?: string };
  }>("/:owner/:repo/commits", async (request, reply) => {
    const state = await authorizedHtmlRepoContentState(request, reply);
    if (!state) {
      return;
    }
    const index = await ensureRepoIndex(config, state);
    const ref = queryString(request.query.ref) ?? state.defaultBranch;
    const limit = Math.max(1, Math.min(queryInt(request.query.limit, 100), 500));
    const repoPath = bareRepoPath(config.repoRoot, state.owner, state.repo);
    await reply.type("text/html; charset=utf-8").send(renderCommitsPage({
      repo: toRepoListItem(state),
      index,
      commits: await readCommits(repoPath, ref, limit),
      ref,
      viewer: webViewerFromRequest(request)
    }));
  });


  app.get<{
    Params: { owner: string; repo: string };
    Querystring: { ref?: string; path?: string };
  }>("/:owner/:repo/tree", async (request, reply) => {
    const state = await authorizedHtmlRepoContentState(request, reply);
    if (!state) {
      return;
    }
    const index = await ensureRepoIndex(config, state);
    const ref = queryString(request.query.ref) ?? state.defaultBranch;
    const path = request.query.path ?? "";
    const repoPath = bareRepoPath(config.repoRoot, state.owner, state.repo);
    await reply.type("text/html; charset=utf-8").send(renderRepoPage({
      repo: toRepoListItem(state),
      index,
      commits: await readCommits(repoPath, ref, 25),
      tree: await readTree(repoPath, ref, path),
      ref,
      path,
      origin: requestOrigin(request),
      viewer: webViewerFromRequest(request)
    }));
  });

  app.get<{
    Params: { owner: string; repo: string };
    Querystring: { ref?: string; path?: string };
  }>("/:owner/:repo/blob", async (request, reply) => {
    const state = await authorizedHtmlRepoContentState(request, reply);
    if (!state) {
      return;
    }
    const index = await ensureRepoIndex(config, state);
    const ref = queryString(request.query.ref) ?? state.defaultBranch;
    const path = queryString(request.query.path);
    if (!path) {
      const error = new Error("File path is required") as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }
    const repoPath = bareRepoPath(config.repoRoot, state.owner, state.repo);
    await reply.type("text/html; charset=utf-8").send(renderBlobPage({
      repo: toRepoListItem(state),
      index,
      commits: await readCommits(repoPath, ref, 25),
      ref,
      file: await readBlob(repoPath, ref, path),
      viewer: webViewerFromRequest(request)
    }));
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
