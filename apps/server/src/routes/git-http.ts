import type { FastifyInstance } from "fastify";
import { handleGitHttp } from "../git.js";
import type { RouteDeps } from "./index.js";

export const gitHttpRoutes = async (app: FastifyInstance, deps: RouteDeps) => {
  app.all("/*", async (request, reply) => {
    if (request.url.includes(".git")) {
      await handleGitHttp(request, reply, deps.config);
      return;
    }

    // Everything else falls through to the not-found handler, which serves the
    // SPA bundle + index.html fallback (see routes/spa.ts).
    return reply.callNotFound();
  });
};
