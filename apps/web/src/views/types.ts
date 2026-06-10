// These view-model types now live in @ducnmm/octopus-shared so the server's
// /v1 JSON API and the SPA share one contract. This module re-exports them
// until the legacy string-template views are deleted.
export type {
  SuiRefState,
  SuiRepoState,
  IndexedCommit,
  TreeEntry,
  BlobView,
  RepoIndex,
  PullRequestStatus,
  PullRequestStatusFilter,
  PullRequestMergeStrategy,
  PullRequestComment,
  PullRequest,
  PullRequestMergeability,
  PullRequestDiffFile,
  PullRequestComparison,
  RepoActivityProof,
  RepoActivityItem
} from "@ducnmm/octopus-shared";
