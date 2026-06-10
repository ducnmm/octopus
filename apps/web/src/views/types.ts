export interface SuiRefState {
  refName: string;
  commitDigest: string;
  manifestId: string;
  actorWalletAddress?: string;
  seq: number;
  updatedAtMs: number;
}

export interface SuiRepoState {
  registryMode: "local" | "testnet";
  repoObjectId: string;
  repoId: string;
  owner: string;
  ownerWallet: string;
  accountId?: string;
  repo: string;
  visibility: "public" | "private";
  defaultBranch: string;
  refs: Record<string, SuiRefState>;
  manifests: any[];
  readers: string[];
  writers: string[];
  createdAtMs: number;
  updatedAtMs: number;
}

export interface IndexedCommit {
  oid: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  committerName?: string;
  committerEmail?: string;
  committedAt?: string;
  subject: string;
  refs: string[];
}

export interface TreeEntry {
  path: string;
  name: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  objectId: string;
  size: number | null;
}

export interface BlobView {
  path: string;
  objectId: string;
  size: number;
  encoding: "utf8" | "base64";
  content: string;
  truncated: boolean;
}

export interface RepoIndex {
  version: 1;
  repoId: string;
  owner: string;
  repo: string;
  defaultBranch: string;
  headCommit: string | null;
  commitCount: number;
  treeEntryCount: number;
  treeTruncated: boolean;
  commits: IndexedCommit[];
  treeEntries: TreeEntry[];
  indexedAtMs: number;
}

export type PullRequestStatus = "open" | "closed" | "merged";
export type PullRequestStatusFilter = PullRequestStatus | "all";
export type PullRequestMergeStrategy = "merge" | "squash" | "fast-forward";

export interface PullRequestComment {
  id: number;
  authorAccountId: string;
  authorWalletAddress: string;
  body: string;
  createdAtMs: number;
}

export interface PullRequest {
  number: number;
  owner: string;
  repo: string;
  repoId: string;
  title: string;
  body: string;
  status: PullRequestStatus;
  baseRef: string;
  headRef: string;
  baseCommit: string;
  headCommit: string;
  authorAccountId: string;
  authorWalletAddress: string;
  createdAtMs: number;
  updatedAtMs: number;
  closedAtMs?: number;
  closedBy?: string;
  mergedAtMs?: number;
  mergedBy?: string;
  mergeCommit?: string;
  mergeStrategy?: PullRequestMergeStrategy;
  comments: PullRequestComment[];
}

export interface PullRequestMergeability {
  mergeable: boolean;
  reason?: string;
}

export interface PullRequestDiffFile {
  path: string;
  additions: number;
  deletions: number;
  binary: boolean;
}

export interface PullRequestComparison {
  baseCommit: string;
  headCommit: string;
  mergeBaseCommit: string;
  commits: IndexedCommit[];
  files: PullRequestDiffFile[];
  commitCount: number;
  fileCount: number;
  additions: number;
  deletions: number;
  patch: string;
  patchTruncated: boolean;
}

export interface RepoActivityProof {
  label: string;
  value: string;
  href?: string;
}

export interface RepoActivityItem {
  id: string;
  kind: "access" | "pull_request" | "push" | "repo";
  title: string;
  description: string;
  actorWalletAddress?: string;
  createdAtMs: number;
  href?: string;
  proof: RepoActivityProof[];
}
