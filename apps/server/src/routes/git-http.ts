import type { FastifyInstance } from "fastify";
import { handleGitHttp } from "../git.js";
import type { RouteDeps } from "./index.js";

export const gitHttpRoutes = async (app: FastifyInstance, deps: RouteDeps) => {
  app.all("/*", async (request, reply) => {
    if (request.url.includes(".git")) {
      await handleGitHttp(request, reply, deps.config);
      return;
    }

    await reply.code(404).send({ error: "Not found" });
  });
};
