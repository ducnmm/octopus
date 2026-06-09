import type { ServerConfig } from "../config/env.js";
import type { WebAuthStore } from "../lib/web-auth-store.js";
import type { Repositories } from "../repositories/index.js";
import { createAuthService, type AuthService } from "./auth-service.js";
import { createEnokiService, type EnokiService } from "./enoki-service.js";
import { createPullRequestService, type PullRequestService } from "./pull-request-service.js";
import { createRepoService, type RepoService } from "./repo-service.js";
import { createRestoreService, type RestoreService } from "./restore-service.js";

/** Business-logic services, instantiated once over the repositories layer. */
export type Services = {
  repoService: RepoService;
  pullRequestService: PullRequestService;
  authService: AuthService;
  restoreService: RestoreService;
  enokiService: EnokiService;
};

export const createServices = (config: ServerConfig, repos: Repositories, webAuthStore: WebAuthStore): Services => ({
  repoService: createRepoService(config, repos),
  pullRequestService: createPullRequestService(repos),
  authService: createAuthService(webAuthStore),
  restoreService: createRestoreService(config, repos),
  enokiService: createEnokiService(config)
});
