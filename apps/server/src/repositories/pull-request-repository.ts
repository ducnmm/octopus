import type { ServerConfig } from "../config/env.js";
import { comparePullRequest, createPullRequest, listPullRequests, readPullRequest } from "../pull-requests.js";

/** Pull-request storage and diff comparison. */
export const createPullRequestRepository = (config: ServerConfig) => ({
  list: (owner: string, repo: string) => listPullRequests(config, owner, repo),
  read: (owner: string, repo: string, number: number) => readPullRequest(config, owner, repo, number),
  create: (
    state: Parameters<typeof createPullRequest>[1],
    input: Parameters<typeof createPullRequest>[2],
    auth: Parameters<typeof createPullRequest>[3]
  ) => createPullRequest(config, state, input, auth),
  compare: (state: Parameters<typeof comparePullRequest>[1], pullRequest: Parameters<typeof comparePullRequest>[2]) =>
    comparePullRequest(config, state, pullRequest)
});

export type PullRequestRepository = ReturnType<typeof createPullRequestRepository>;
