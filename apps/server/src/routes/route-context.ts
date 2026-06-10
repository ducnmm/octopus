import type { FastifyReply, FastifyRequest } from "fastify";
import { parseDelegateAuth, type AuthContext } from "../auth.js";
import type { ServerConfig } from "../config/env.js";
import { httpError } from "../lib/http-error.js";
import { normalizeReturnTo, requestOrigin } from "../lib/request-helpers.js";
import { authFromWebSession } from "../lib/web-session.js";
import {
  hasDelegateAuth,
  webSessionEntryFromRequest,
  webSessionFromRequest,
  webViewerFromRequest
} from "../plugins/auth-context.js";
import type { Repositories } from "../repositories/index.js";
import type { Services } from "../services/index.js";
import type { SuiRepoState } from "../sui.js";
import { toRepoListItem } from "@ducnmm/octopus-shared";
import { renderPrivateRepoLoginPage, renderPrivateRepoUnlockPage } from "@octopus/web/views/pages.js";

const statusCodeOf = (error: unknown): number =>
  typeof (error as Error & { statusCode?: unknown }).statusCode === "number"
    ? (error as Error & { statusCode: number }).statusCode
    : 500;

/**
 * Per-request helpers shared across route plugins: auth-context resolution,
 * login/unlock URL building, content-access gating, and HTML auth fallbacks.
 * Heavy logic is delegated to services.
 */
export const createRouteContext = (config: ServerConfig, repositories: Repositories, services: Services) => {
  const requestAuthContext = async (request: FastifyRequest): Promise<AuthContext | null> => {
    if (hasDelegateAuth(request)) {
      try {
        return await parseDelegateAuth(config, request);
      } catch (error) {
        throw httpError(error instanceof Error ? error.message : String(error), 401);
      }
    }

    const session = webSessionFromRequest(request);
    return session ? authFromWebSession(session) : null;
  };

  const serverOriginForRequest = (request: FastifyRequest): string =>
    requestOrigin(request) ?? `http://${config.host}:${config.port}`;

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
    const hasSession = Boolean(webSessionEntryFromRequest(request));
    throw httpError(
      "Repository content is locked. Unlock this repository with your wallet first.",
      hasSession ? 423 : 401,
      hasSession ? "repo_locked" : "login_required"
    );
  };

  const authorizedRepoState = async (request: FastifyRequest, owner: string, repo: string): Promise<SuiRepoState> =>
    services.repoService.getAuthorizedState(owner, repo, await requestAuthContext(request));

  const visibleRepoItems = (request: FastifyRequest) =>
    requestAuthContext(request).then((auth) => services.repoService.listVisible(auth));

  const authorizedHtmlRepoState = async (
    request: FastifyRequest<{ Params: { owner: string; repo: string } }>,
    reply: FastifyReply
  ): Promise<SuiRepoState | null> => {
    try {
      return await authorizedRepoState(request, request.params.owner, request.params.repo);
    } catch (error) {
      const statusCode = statusCodeOf(error);
      const state = await repositories.sui.readState(request.params.owner, request.params.repo);
      if ((statusCode === 401 || statusCode === 403) && state?.visibility === "private") {
        await reply
          .code(statusCode)
          .type("text/html; charset=utf-8")
          .send(
            renderPrivateRepoLoginPage({
              repo: toRepoListItem(state),
              viewer: webViewerFromRequest(request),
              loginHref: webLoginUrl(request, request.url),
              message:
                statusCode === 403
                  ? "This wallet does not have access to this private repository."
                  : "Sign in with your Sui wallet to view this private repository."
            })
          );
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
      const statusCode = statusCodeOf(error);
      if (statusCode === 423 || statusCode === 401) {
        const viewer = webViewerFromRequest(request);
        await reply
          .code(statusCode)
          .type("text/html; charset=utf-8")
          .send(
            viewer
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
                })
          );
        return null;
      }
      throw error;
    }
  };

  return {
    requestAuthContext,
    serverOriginForRequest,
    webLoginUrl,
    webUnlockUrl,
    repoContentUnlocked,
    requireRepoContentAccess,
    authorizedRepoState,
    visibleRepoItems,
    authorizedHtmlRepoState,
    authorizedHtmlRepoContentState
  };
};

export type RouteContext = ReturnType<typeof createRouteContext>;
