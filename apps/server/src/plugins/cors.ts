import fp from "fastify-plugin";
import type { ServerConfig } from "../config/env.js";

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

export type CorsPluginOptions = {
  config: ServerConfig;
};

/**
 * Cross-origin handling: mirrors the configured web origin (and loopback during
 * local dev) and short-circuits preflight requests.
 */
export const corsPlugin = fp<CorsPluginOptions>(
  async (app, opts) => {
    const { config } = opts;

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
  },
  { name: "octopus-cors" }
);

export default corsPlugin;
