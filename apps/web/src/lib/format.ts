import type { RepoListItem } from "@ducnmm/octopus-shared";

export const shortWallet = (walletAddress: string): string => {
  return walletAddress.length > 14 ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : walletAddress;
};

export const shortCommit = (digest: string): string => digest.slice(0, 7);

export const shortRef = (ref: string): string => {
  return ref.replace(/^refs\/heads\//, "").replace(/^refs\/tags\//, "");
};

export const pluralize = (count: number, singular: string, plural = `${singular}s`): string => {
  return `${count} ${count === 1 ? singular : plural}`;
};

export const formatDate = (value: number): string => {
  return new Date(value)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, " UTC");
};

export const formatRelativeDate = (value: string | number): string => {
  const date = new Date(value);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) {
    return "";
  }

  const diffMs = Date.now() - timestamp;
  const absMs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;
  const year = 365 * day;

  if (absMs < minute) {
    return "just now";
  }
  if (absMs < hour) {
    const minutes = Math.max(1, Math.round(absMs / minute));
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (absMs < day) {
    const hours = Math.max(1, Math.round(absMs / hour));
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  if (absMs < 2 * day) {
    return "yesterday";
  }
  if (absMs < month) {
    const days = Math.max(1, Math.round(absMs / day));
    return `${days} days ago`;
  }
  if (absMs < year) {
    const months = Math.max(1, Math.round(absMs / month));
    return `${months} month${months === 1 ? "" : "s"} ago`;
  }

  const years = Math.max(1, Math.round(absMs / year));
  return `${years} year${years === 1 ? "" : "s"} ago`;
};

const isWalletOwnerLabel = (owner: string): boolean => /^0x[0-9a-f]{8,}$/i.test(owner);

export type ActorDisplay = { label: string; title: string };

/** Prefer the human owner name when the wallet belongs to the repo owner. */
export const actorDisplayForWallet = (repo: RepoListItem, walletAddress: string | undefined): ActorDisplay | null => {
  const wallet = walletAddress?.trim();
  if (!wallet) {
    return null;
  }

  const normalizedWallet = wallet.toLowerCase();
  const matchesOwner =
    normalizedWallet === repo.ownerWallet.toLowerCase() || normalizedWallet === repo.owner.toLowerCase();
  return {
    label: matchesOwner && !isWalletOwnerLabel(repo.owner) ? repo.owner : shortWallet(wallet),
    title: wallet
  };
};

export const repoBasePath = (repo: Pick<RepoListItem, "owner" | "name">): string =>
  `/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
