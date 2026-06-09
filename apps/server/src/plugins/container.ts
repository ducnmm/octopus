import fp from "fastify-plugin";
import type { ServerConfig } from "../config/env.js";
import type { WebAuthStore } from "../lib/web-auth-store.js";
import type { Repositories } from "../repositories/index.js";
import type { Services } from "../services/index.js";

/**
 * Aggregate of config-bound singletons (repositories, services, stores) wired
 * once at boot and exposed on the Fastify instance as `app.services`.
 */
export type ServiceContainer = {
  config: ServerConfig;
  webAuthStore: WebAuthStore;
  repositories: Repositories;
} & Services;

export type ContainerPluginOptions = {
  container: ServiceContainer;
};

declare module "fastify" {
  interface FastifyInstance {
    services: ServiceContainer;
  }
}

export const containerPlugin = fp<ContainerPluginOptions>(
  async (app, opts) => {
    app.decorate("services", opts.container);
  },
  { name: "octopus-container" }
);

export default containerPlugin;
