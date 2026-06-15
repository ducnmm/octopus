// View-model types shared between the server's /v1 JSON API and the web SPA.
// These describe the wire shapes pages consume; the server's internal Sui/Git
// types must stay structurally assignable to them.

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
  manifests: unknown[];
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

export type RepoRefListItem = {
  name: string;
  shortName: string;
  commitDigest: string;
  updatedAtMs: number;
  isDefault: boolean;
};

export type RepoListItem = {
  owner: string;
  ownerWallet: string;
  name: string;
  repoId: string;
  visibility: SuiRepoState["visibility"];
  gitRemotePath: string;
  repoObjectId: string;
  defaultBranch: string;
  defaultBranchCommit: string | null;
  refCount: number;
  refs: RepoRefListItem[];
  manifestCount: number;
  readers: string[];
  writers: string[];
  commitCount?: number;
  commitDates?: string[];
  pullRequestCount?: number;
  activityCount?: number;
  createdAtMs: number;
  updatedAtMs: number;
};

export type WebViewer = {
  walletAddress: string;
} | null;

export type CommitActorMap = Record<string, string | undefined>;

const shortRef = (ref: string): string => {
  return ref.replace(/^refs\/heads\//, "").replace(/^refs\/tags\//, "");
};

const repoBranchRefs = (state: SuiRepoState): RepoRefListItem[] => {
  const allRefs = Object.values(state.refs);
  const branchRefs = allRefs.filter((ref) => ref.refName.startsWith("refs/heads/"));
  const refs = branchRefs.length > 0 ? branchRefs : allRefs;

  return refs
    .map((ref) => ({
      name: ref.refName,
      shortName: shortRef(ref.refName),
      commitDigest: ref.commitDigest,
      updatedAtMs: ref.updatedAtMs,
      isDefault: ref.refName === state.defaultBranch
    }))
    .sort((a, b) => {
      if (a.isDefault !== b.isDefault) {
        return a.isDefault ? -1 : 1;
      }
      return a.shortName.localeCompare(b.shortName);
    });
};

export const toRepoListItem = (state: SuiRepoState): RepoListItem => {
  const refs = repoBranchRefs(state);

  return {
    owner: state.owner,
    ownerWallet: state.ownerWallet,
    name: state.repo,
    repoId: state.repoId,
    visibility: state.visibility,
    gitRemotePath: `/${state.owner}/${state.repo}.git`,
    repoObjectId: state.repoObjectId,
    defaultBranch: state.defaultBranch,
    defaultBranchCommit: state.refs[state.defaultBranch]?.commitDigest ?? null,
    refCount: refs.length,
    refs,
    manifestCount: state.manifests.length,
    readers: state.readers ?? [],
    writers: state.writers ?? [],
    createdAtMs: state.createdAtMs,
    updatedAtMs: state.updatedAtMs
  };
};
