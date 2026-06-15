import type { ServerConfig } from "../config/env.js";
import {
  addPullRequestComment,
  assessPullRequestMergeability,
  closePullRequest,
  comparePullRequest,
  createPullRequest,
  listPullRequestComments,
  listPullRequests,
  mergePullRequest,
  readPullRequest,
  refreshPullRequest,
  reopenPullRequest,
  type PullRequestStatusFilter
} from "../pull-requests.js";

/** Pull-request storage, lifecycle transitions, comments, and diff comparison. */
export const createPullRequestRepository = (config: ServerConfig) => ({
  list: (owner: string, repo: string, status: PullRequestStatusFilter = "all") =>
    listPullRequests(config, owner, repo, status),
  read: (owner: string, repo: string, number: number) => readPullRequest(config, owner, repo, number),
  create: (
    state: Parameters<typeof createPullRequest>[1],
    input: Parameters<typeof createPullRequest>[2],
    auth: Parameters<typeof createPullRequest>[3]
  ) => createPullRequest(config, state, input, auth),
  compare: (state: Parameters<typeof comparePullRequest>[1], pullRequest: Parameters<typeof comparePullRequest>[2]) =>
    comparePullRequest(config, state, pullRequest),
  refresh: (state: Parameters<typeof refreshPullRequest>[1], number: number) =>
    refreshPullRequest(config, state, number),
  mergeability: (
    state: Parameters<typeof assessPullRequestMergeability>[1],
    pullRequest: Parameters<typeof assessPullRequestMergeability>[2]
  ) => assessPullRequestMergeability(config, state, pullRequest),
  close: (
    state: Parameters<typeof closePullRequest>[1],
    number: number,
    auth: Parameters<typeof closePullRequest>[3]
  ) => closePullRequest(config, state, number, auth),
  reopen: (
    state: Parameters<typeof reopenPullRequest>[1],
    number: number,
    auth: Parameters<typeof reopenPullRequest>[3]
  ) => reopenPullRequest(config, state, number, auth),
  merge: (
    state: Parameters<typeof mergePullRequest>[1],
    number: number,
    input: Parameters<typeof mergePullRequest>[3],
    auth: Parameters<typeof mergePullRequest>[4]
  ) => mergePullRequest(config, state, number, input, auth),
  addComment: (
    state: Parameters<typeof addPullRequestComment>[1],
    number: number,
    body: string,
    auth: Parameters<typeof addPullRequestComment>[4]
  ) => addPullRequestComment(config, state, number, body, auth),
  listComments: (owner: string, repo: string, number: number) => listPullRequestComments(config, owner, repo, number)
});

export type PullRequestRepository = ReturnType<typeof createPullRequestRepository>;
