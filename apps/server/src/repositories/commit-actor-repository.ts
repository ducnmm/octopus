import type { ServerConfig } from "../config/env.js";
import { readCommitActors } from "../commit-actors.js";

/** Maps commits to on-chain contributor identities. */
export const createCommitActorRepository = (config: ServerConfig) => ({
  read: (state: Parameters<typeof readCommitActors>[1], repoPath: string) => readCommitActors(config, state, repoPath)
});

export type CommitActorRepository = ReturnType<typeof createCommitActorRepository>;
