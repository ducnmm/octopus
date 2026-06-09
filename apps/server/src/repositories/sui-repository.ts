import type { ServerConfig } from "../config/env.js";
import {
  anchorPushManifests,
  canManageRepoAccess,
  canReadRepo,
  canWriteRepo,
  ensureSuiRepo,
  listSuiRepoStates,
  readSuiRepoManifests,
  readSuiRepoState,
  updateSuiRepoAccess
} from "../sui.js";

/** Sui-anchored repository state, access roles, and ref manifests. */
export const createSuiRepository = (config: ServerConfig) => ({
  ensureRepo: (input: Parameters<typeof ensureSuiRepo>[1], auth: Parameters<typeof ensureSuiRepo>[2]) =>
    ensureSuiRepo(config, input, auth),
  anchorManifests: (input: Parameters<typeof anchorPushManifests>[1]) => anchorPushManifests(config, input),
  readState: (owner: string, repo: string) => readSuiRepoState(config, owner, repo),
  listStates: () => listSuiRepoStates(config),
  readManifests: (owner: string, repo: string) => readSuiRepoManifests(config, owner, repo),
  updateAccess: (state: Parameters<typeof updateSuiRepoAccess>[1], change: Parameters<typeof updateSuiRepoAccess>[2]) =>
    updateSuiRepoAccess(config, state, change),
  // Pure authorization predicates (no config / IO).
  canRead: canReadRepo,
  canWrite: canWriteRepo,
  canManageAccess: canManageRepoAccess
});

export type SuiRepository = ReturnType<typeof createSuiRepository>;
