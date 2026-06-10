import type { PullRequest, RepoListItem, WebViewer } from "@ducnmm/octopus-shared";
import { repoBasePath } from "./format.js";
import { canWriteRepo } from "./repo-utils.js";

export const pullRequestHref = (repo: RepoListItem, pullRequest: Pick<PullRequest, "number">): string =>
  `${repoBasePath(repo)}/pulls/${pullRequest.number}`;

export const canWritePullRequests = canWriteRepo;

export const isPullRequestAuthor = (pullRequest: PullRequest, viewer: WebViewer): boolean => {
  return Boolean(viewer && viewer.walletAddress.toLowerCase() === pullRequest.authorWalletAddress.toLowerCase());
};
