import type { MergePullRequestRequest } from "@ducnmm/octopus-shared";
import type { AuthContext } from "../auth.js";
import { httpError } from "../lib/http-error.js";
import type { PullRequest, PullRequestStatusFilter } from "../pull-requests.js";
import type { Repositories } from "../repositories/index.js";
import type { SuiRepoState } from "../sui.js";

/**
 * Pull-request lifecycle: listing, comparison, creation, close/reopen, merge,
 * and comments. Merge requires repository write access; close, reopen, and
 * comment are allowed to the PR author or any writer.
 */
export const createPullRequestService = (repos: Repositories) => {
  const list = (owner: string, repo: string, status: PullRequestStatusFilter = "all") =>
    repos.pullRequests.list(owner, repo, status);

  const requirePullRequest = async (state: SuiRepoState, number: number): Promise<PullRequest> => {
    const pullRequest = await repos.pullRequests.read(state.owner, state.repo, number);
    if (!pullRequest) {
      throw httpError("Pull request not found", 404);
    }
    return pullRequest;
  };

  const isAuthorOrWriter = (state: SuiRepoState, pullRequest: PullRequest, auth: AuthContext): boolean => {
    return (
      repos.sui.canWrite(state, auth) ||
      pullRequest.authorWalletAddress === auth.walletAddress ||
      pullRequest.authorAccountId === auth.accountId
    );
  };

  const readWithComparison = async (state: SuiRepoState, number: number) => {
    await requirePullRequest(state, number);
    const pullRequest = await repos.pullRequests.refresh(state, number);
    return {
      pullRequest,
      comparison: await repos.pullRequests.compare(state, pullRequest),
      mergeability: await repos.pullRequests.mergeability(state, pullRequest)
    };
  };

  const create = async (
    state: SuiRepoState,
    input: Parameters<Repositories["pullRequests"]["create"]>[1],
    auth: AuthContext
  ) => {
    if (!repos.sui.canWrite(state, auth)) {
      throw httpError("Write access is required to open a pull request", 403);
    }
    return repos.pullRequests.create(state, input, auth);
  };

  const close = async (state: SuiRepoState, number: number, auth: AuthContext) => {
    const pullRequest = await requirePullRequest(state, number);
    if (!isAuthorOrWriter(state, pullRequest, auth)) {
      throw httpError("Only the pull request author or a repository writer can close it", 403);
    }
    return repos.pullRequests.close(state, number, auth);
  };

  const reopen = async (state: SuiRepoState, number: number, auth: AuthContext) => {
    const pullRequest = await requirePullRequest(state, number);
    if (!isAuthorOrWriter(state, pullRequest, auth)) {
      throw httpError("Only the pull request author or a repository writer can reopen it", 403);
    }
    return repos.pullRequests.reopen(state, number, auth);
  };

  const merge = async (state: SuiRepoState, number: number, input: MergePullRequestRequest, auth: AuthContext) => {
    if (!repos.sui.canWrite(state, auth)) {
      throw httpError("Write access is required to merge a pull request", 403);
    }
    await requirePullRequest(state, number);
    return repos.pullRequests.merge(state, number, input, auth);
  };

  const addComment = async (state: SuiRepoState, number: number, body: string, auth: AuthContext) => {
    const pullRequest = await requirePullRequest(state, number);
    if (!isAuthorOrWriter(state, pullRequest, auth)) {
      throw httpError("Only the pull request author or a repository writer can comment", 403);
    }
    return repos.pullRequests.addComment(state, number, body, auth);
  };

  const listComments = async (state: SuiRepoState, number: number) => {
    await requirePullRequest(state, number);
    return repos.pullRequests.listComments(state.owner, state.repo, number);
  };

  return { list, readWithComparison, create, close, reopen, merge, addComment, listComments };
};

export type PullRequestService = ReturnType<typeof createPullRequestService>;
