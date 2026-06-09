import type { ServerConfig } from "../config/env.js";
import { ensureRepoIndex, indexRepository, readBlob, readCommits, readTree, resolveCommit } from "../indexer.js";

/** Disposable file/commit index over a bare repository. */
export const createIndexRepository = (config: ServerConfig) => ({
  ensure: (state: Parameters<typeof ensureRepoIndex>[1]) => ensureRepoIndex(config, state),
  reindex: (state: Parameters<typeof indexRepository>[1]) => indexRepository(config, state),
  commits: readCommits,
  tree: readTree,
  blob: readBlob,
  resolveCommit
});

export type IndexRepository = ReturnType<typeof createIndexRepository>;
