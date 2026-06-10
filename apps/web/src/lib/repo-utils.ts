import type {
  CommitActorMap,
  IndexedCommit,
  RepoIndex,
  RepoListItem,
  TreeEntry,
  WebViewer
} from "@ducnmm/octopus-shared";
import { actorDisplayForWallet, shortRef, type ActorDisplay } from "./format.js";

export const commitTimestamp = (commit: IndexedCommit): string => {
  return commit.committedAt || commit.authoredAt;
};

export const gitActorTitle = (commit: IndexedCommit): string => {
  const name = commit.committerName || commit.authorName || "Octopus";
  const email = commit.committerEmail || commit.authorEmail;
  return email ? `${name} <${email}>` : name;
};

export const commitActorDisplay = (
  repo: RepoListItem,
  commit: IndexedCommit,
  commitActors?: CommitActorMap
): ActorDisplay => {
  const actor = actorDisplayForWallet(repo, commitActors?.[commit.oid]);
  if (actor) {
    return {
      ...actor,
      title: `${actor.title}; Git author: ${gitActorTitle(commit)}`
    };
  }

  return {
    label: commit.committerName || commit.authorName || "Octopus",
    title: gitActorTitle(commit)
  };
};

export const initials = (value: string): string => {
  const letters = value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
  return letters ? letters.toUpperCase() : "OC";
};

export const canManageRepoAccess = (repo: RepoListItem, viewer: WebViewer): boolean => {
  if (!viewer) {
    return false;
  }

  const walletAddress = viewer.walletAddress.toLowerCase();
  return walletAddress === repo.ownerWallet.toLowerCase() || walletAddress === repo.owner.toLowerCase();
};

export const canWriteRepo = (repo: RepoListItem, viewer: WebViewer): boolean => {
  if (!viewer) {
    return false;
  }
  if (canManageRepoAccess(repo, viewer)) {
    return true;
  }
  const walletAddress = viewer.walletAddress.toLowerCase();
  return repo.writers.some((writer) => writer.toLowerCase() === walletAddress);
};

export const sameRef = (left: string, right: string): boolean => {
  return shortRef(left) === shortRef(right);
};

export const commitCountForRef = (index: RepoIndex, ref: string, commits: IndexedCommit[]): number => {
  return sameRef(ref, index.defaultBranch) ? index.commitCount : commits.length;
};

export const findReadmeEntry = (tree: TreeEntry[]): TreeEntry | undefined => {
  return tree.find(
    (entry) => entry.type === "blob" && !entry.path.includes("/") && /^readme(?:\..*)?$/i.test(entry.path)
  );
};

export const hrefWithQuery = (path: string, params: Record<string, string | undefined>): string => {
  const query = Object.entries(params)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return query ? `${path}?${query}` : path;
};
