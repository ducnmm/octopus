import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import type { ServerConfig } from "./config/env.js";
import { WebAuthStore } from "./lib/web-auth-store.js";
import { authContextPlugin } from "./plugins/auth-context.js";
import { containerPlugin, type ServiceContainer } from "./plugins/container.js";
import { contentParsersPlugin } from "./plugins/content-parsers.js";
import { corsPlugin } from "./plugins/cors.js";
import { errorHandlerPlugin } from "./plugins/error-handler.js";
import { createRepositories } from "./repositories/index.js";
import { registerRoutes } from "./routes/index.js";
import { createServices } from "./services/index.js";

/**
 * Application composition root: creates the Fastify instance, wires the service
 * container + cross-cutting infrastructure plugins, then registers the feature
 * route plugins. Process bootstrap (listen / shutdown) lives in `index.ts`.
 */
export const buildServer = (config: ServerConfig) => {
  const app = Fastify({
    logger: {
      redact: [
        "req.headers.x-octopus-delegate-key",
        "headers.x-octopus-delegate-key",
        "req.headers.x-octopus-auth-token",
        "headers.x-octopus-auth-token",
        "req.headers.cookie",
        "headers.cookie"
      ]
    },
    bodyLimit: 1024 * 1024 * 200
  });

  // Route schemas are derived from the shared Zod request schemas.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const webAuthStore = new WebAuthStore();
  const repositories = createRepositories(config);
  const services = createServices(config, repositories, webAuthStore);
  const container: ServiceContainer = { config, webAuthStore, repositories, ...services };

  // Cross-cutting infrastructure (registered first so decorators + hooks apply
  // to every feature route).
  app.register(corsPlugin, { config });
  app.register(errorHandlerPlugin);
  app.register(contentParsersPlugin);
  app.register(containerPlugin, { container });
  app.register(authContextPlugin, { config, webAuthStore });

  registerRoutes(app, { config, repositories, services });

  return app;
};
