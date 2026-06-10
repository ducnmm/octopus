import type { FastifyRequest } from "fastify";
import { parseDelegateAuth, type AuthContext } from "../auth.js";
import type { ServerConfig } from "../config/env.js";
import { httpError } from "../lib/http-error.js";
import { requestOrigin } from "../lib/request-helpers.js";
import { authFromWebSession } from "../lib/web-session.js";
import { hasDelegateAuth, webSessionEntryFromRequest, webSessionFromRequest } from "../plugins/auth-context.js";
import type { Repositories } from "../repositories/index.js";
import type { Services } from "../services/index.js";
import type { SuiRepoState } from "../sui.js";

/**
 * Per-request helpers shared across route plugins: auth-context resolution and
 * content-access gating. Auth failures surface as structured JSON error codes
 * (`login_required` / `repo_locked`) that the web SPA turns into wallet flows.
 * Heavy logic is delegated to services.
 */
export const createRouteContext = (config: ServerConfig, _repositories: Repositories, services: Services) => {
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

  return {
    requestAuthContext,
    serverOriginForRequest,
    repoContentUnlocked,
    requireRepoContentAccess,
    authorizedRepoState,
    visibleRepoItems
  };
};

export type RouteContext = ReturnType<typeof createRouteContext>;
