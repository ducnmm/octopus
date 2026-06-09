import type { ServerConfig } from "../config/env.js";
import { readRepoManifests } from "../artifacts.js";

/** Locally cached push artifact / pack manifests. */
export const createManifestRepository = (config: ServerConfig) => ({
  read: (owner: string, repo: string) => readRepoManifests(config.dataDir, owner, repo)
});

export type ManifestRepository = ReturnType<typeof createManifestRepository>;
