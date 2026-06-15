import { delegateAuthHeaders, type WebViewer } from "@ducnmm/octopus-shared";
import type { FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import type { ServerConfig } from "../config/env.js";
import type { WebAuthStore } from "../lib/web-auth-store.js";
import { decodeWebSessionCookie, parseCookies, webSessionCookieName, type WebSession } from "../lib/web-session.js";

export const hasDelegateAuth = (request: { headers: Record<string, unknown> }): boolean => {
  return Boolean(
    request.headers[delegateAuthHeaders.token] ||
    request.headers[delegateAuthHeaders.delegateKey] ||
    request.headers[delegateAuthHeaders.accountId]
  );
};

/** Web-session identity resolved by the onRequest hook below. */
export const webSessionEntryFromRequest = (
  request: FastifyRequest
): { sessionId: string; session: WebSession } | null => {
  return request.webSession && request.webSessionId
    ? { sessionId: request.webSessionId, session: request.webSession }
    : null;
};

export const webSessionFromRequest = (request: FastifyRequest): WebSession | null => request.webSession;

export const webViewerFromRequest = (request: FastifyRequest): WebViewer => {
  return request.webSession ? { walletAddress: request.webSession.walletAddress } : null;
};

export type AuthContextPluginOptions = {
  config: ServerConfig;
  webAuthStore: WebAuthStore;
};

declare module "fastify" {
  interface FastifyRequest {
    webSession: WebSession | null;
    webSessionId: string | null;
  }
}

/**
 * Resolves web-session identity from the signed cookie once per request and
 * attaches it to the request. Delegate-token auth stays route-scoped (resolved
 * on demand) because token scope varies per endpoint.
 */
export const authContextPlugin = fp<AuthContextPluginOptions>(
  async (app, opts) => {
    const { config, webAuthStore } = opts;

    app.decorateRequest("webSession", null);
    app.decorateRequest("webSessionId", null);

    app.addHook("onRequest", async (request) => {
      webAuthStore.cleanup();
      const cookie = parseCookies(request.headers.cookie)[webSessionCookieName];
      if (!cookie) {
        return;
      }

      const decoded = decodeWebSessionCookie(cookie, config.webSessionSecret);
      if (decoded) {
        request.webSession = decoded.session;
        request.webSessionId = decoded.sessionId;
      }
    });
  },
  { name: "octopus-auth-context" }
);

export default authContextPlugin;
