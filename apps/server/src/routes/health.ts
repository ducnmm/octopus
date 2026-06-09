import type { FastifyInstance } from "fastify";
import type { RouteDeps } from "./index.js";

const serverBuildMarker = "git-reconcile-v3";

export const healthRoutes = async (app: FastifyInstance, deps: RouteDeps) => {
  const { config } = deps;

  app.get("/healthz", async () => ({
    ok: true,
    service: "octopus-server",
    build: serverBuildMarker,
    gitCommit: config.buildSha,
    railwayDeploymentId: config.railwayDeploymentId,
    railwayServiceName: config.railwayServiceName
  }));
};
