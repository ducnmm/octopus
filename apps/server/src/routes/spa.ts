import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve, sep } from "node:path";
import type { FastifyInstance } from "fastify";
import type { RouteDeps } from "./index.js";

const STATIC_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
};

const resolveWebDistDir = (configured: string | undefined): string | null => {
  if (configured) {
    return resolve(configured);
  }
  try {
    const require = createRequire(import.meta.url);
    return join(dirname(require.resolve("@octopus/web/package.json")), "dist");
  } catch {
    return null;
  }
};

/**
 * Serves the built web SPA: static bundle files from `@octopus/web`'s dist
 * (or OCTOPUS_WEB_DIST_DIR) plus an `index.html` history-API fallback for any
 * unmatched GET that accepts HTML. Registered after every other route plugin,
 * and implemented as the not-found handler so Git smart-HTTP, `/v1/*`,
 * `/healthz`, and the exact asset routes always win.
 */
export const spaRoutes = async (app: FastifyInstance, deps: RouteDeps) => {
  const distDir = resolveWebDistDir(deps.config.webDistDir);
  let indexHtml: string | null = null;
  if (distDir) {
    try {
      indexHtml = await readFile(join(distDir, "index.html"), "utf8");
    } catch {
      indexHtml = null;
    }
  }
  if (!indexHtml) {
    app.log.warn(
      { distDir },
      "web SPA bundle not found; page URLs will return 404 (set OCTOPUS_WEB_DIST_DIR or build @octopus/web)"
    );
  }

  const staticFile = async (urlPath: string): Promise<{ data: Buffer; type: string } | null> => {
    if (!distDir) {
      return null;
    }
    const type = STATIC_TYPES[extname(urlPath)];
    if (!type) {
      return null;
    }
    const target = resolve(join(distDir, decodeURIComponent(urlPath)));
    if (target !== distDir && !target.startsWith(`${distDir}${sep}`)) {
      return null;
    }
    try {
      return { data: await readFile(target), type };
    } catch {
      return null;
    }
  };

  app.setNotFoundHandler(async (request, reply) => {
    const urlPath = request.url.split("?")[0] ?? "";

    if (request.method === "GET" || request.method === "HEAD") {
      const file = await staticFile(urlPath);
      if (file) {
        const cacheControl = urlPath.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=300";
        await reply.header("cache-control", cacheControl).type(file.type).send(file.data);
        return;
      }

      const accept = String(request.headers.accept ?? "");
      const isPageRequest =
        indexHtml !== null &&
        accept.includes("text/html") &&
        !urlPath.startsWith("/v1/") &&
        urlPath !== "/healthz" &&
        !urlPath.includes(".git/");
      if (isPageRequest) {
        await reply.header("cache-control", "no-store").type("text/html; charset=utf-8").send(indexHtml);
        return;
      }
    }

    await reply.code(404).send({ error: "Not found" });
  });
};
