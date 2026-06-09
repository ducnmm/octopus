import type { ServerConfig } from "../config/env.js";
import { assertRepositoryExists, bareRepoPath, initBareRepository, setBareRepositoryHead } from "../git.js";

/** Bare Git repository management under the cache root (`data/repos`). */
export const createGitRepository = (config: ServerConfig) => ({
  path: (owner: string, repo: string): string => bareRepoPath(config.repoRoot, owner, repo),
  init: (owner: string, repo: string): Promise<string> => initBareRepository(config.repoRoot, owner, repo),
  setHead: (repoPath: string, refName?: string | null): Promise<void> => setBareRepositoryHead(repoPath, refName),
  assertExists: (owner: string, repo: string): Promise<string> => assertRepositoryExists(config.repoRoot, owner, repo)
});

export type GitRepository = ReturnType<typeof createGitRepository>;
