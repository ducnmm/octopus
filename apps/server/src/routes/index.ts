import type { FastifyInstance } from "fastify";
import type { ServerConfig } from "../config/env.js";
import type { Repositories } from "../repositories/index.js";
import type { Services } from "../services/index.js";
import { assetRoutes } from "./assets.js";
import { authRoutes } from "./auth-routes.js";
import { enokiRoutes } from "./enoki-routes.js";
import { gitHttpRoutes } from "./git-http.js";
import { healthRoutes } from "./health.js";
import { pullRequestRoutes } from "./pull-request-routes.js";
import { repoRoutes } from "./repo-routes.js";
import { createRouteContext, type RouteContext } from "./route-context.js";

export type RouteDeps = {
  config: ServerConfig;
  repositories: Repositories;
  services: Services;
  ctx: RouteContext;
};

/** Registers every feature route plugin against the shared route context. */
export const registerRoutes = (
  app: FastifyInstance,
  base: { config: ServerConfig; repositories: Repositories; services: Services }
): void => {
  const deps: RouteDeps = {
    ...base,
    ctx: createRouteContext(base.config, base.repositories, base.services)
  };

  app.register(healthRoutes, deps);
  app.register(assetRoutes, deps);
  app.register(authRoutes, deps);
  app.register(enokiRoutes, deps);
  app.register(repoRoutes, deps);
  app.register(pullRequestRoutes, deps);
  app.register(gitHttpRoutes, deps);
};
