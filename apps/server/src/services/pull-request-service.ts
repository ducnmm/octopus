import type { AuthContext } from "../auth.js";
import { httpError } from "../lib/http-error.js";
import type { Repositories } from "../repositories/index.js";
import type { SuiRepoState } from "../sui.js";

/** Pull-request listing, comparison, and creation (with write-access checks). */
export const createPullRequestService = (repos: Repositories) => {
  const list = (owner: string, repo: string) => repos.pullRequests.list(owner, repo);

  const readWithComparison = async (state: SuiRepoState, number: number) => {
    const pullRequest = await repos.pullRequests.read(state.owner, state.repo, number);
    if (!pullRequest) {
      throw httpError("Pull request not found", 404);
    }
    return { pullRequest, comparison: await repos.pullRequests.compare(state, pullRequest) };
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

  return { list, readWithComparison, create };
};

export type PullRequestService = ReturnType<typeof createPullRequestService>;
