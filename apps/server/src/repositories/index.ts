import type { ServerConfig } from "../config/env.js";
import { createActivityRepository, type ActivityRepository } from "./activity-repository.js";
import { createCommitActorRepository, type CommitActorRepository } from "./commit-actor-repository.js";
import { createGitRepository, type GitRepository } from "./git-repository.js";
import { createIndexRepository, type IndexRepository } from "./index-repository.js";
import { createManifestRepository, type ManifestRepository } from "./manifest-repository.js";
import { createPullRequestRepository, type PullRequestRepository } from "./pull-request-repository.js";
import { createSealRepository, type SealRepository } from "./seal-repository.js";
import { createSuiRepository, type SuiRepository } from "./sui-repository.js";
import { createWalrusRepository, type WalrusRepository } from "./walrus-repository.js";

/** All config-bound data-access repositories, instantiated once at boot. */
export type Repositories = {
  git: GitRepository;
  sui: SuiRepository;
  index: IndexRepository;
  pullRequests: PullRequestRepository;
  activity: ActivityRepository;
  commitActors: CommitActorRepository;
  manifests: ManifestRepository;
  walrus: WalrusRepository;
  seal: SealRepository;
};

export const createRepositories = (config: ServerConfig): Repositories => ({
  git: createGitRepository(config),
  sui: createSuiRepository(config),
  index: createIndexRepository(config),
  pullRequests: createPullRequestRepository(config),
  activity: createActivityRepository(config),
  commitActors: createCommitActorRepository(config),
  manifests: createManifestRepository(config),
  walrus: createWalrusRepository(config),
  seal: createSealRepository(config)
});
