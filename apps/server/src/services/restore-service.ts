import type { AuthContext } from "../auth.js";
import type { ServerConfig } from "../config/env.js";
import type { Repositories } from "../repositories/index.js";
import { restoreRepository } from "../restore.js";

/** Restores a repository from durable artifacts, then refreshes its index. */
export const createRestoreService = (config: ServerConfig, repos: Repositories) => {
  const restore = async (owner: string, repo: string, auth: AuthContext) => {
    const result = await restoreRepository(config, owner, repo, auth);
    const restoredState = await repos.sui.readState(owner, repo);
    if (restoredState) {
      await repos.index.reindex(restoredState);
    }
    return result;
  };

  return { restore };
};

export type RestoreService = ReturnType<typeof createRestoreService>;
