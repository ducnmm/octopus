import type {
  BlobView,
  IndexedCommit,
  RepoIndex,
  TreeEntry,
  PullRequest,
  PullRequestComparison,
  PullRequestMergeability,
  PullRequestStatusFilter,
  RepoActivityItem,
  RepoActivityProof
} from "./types.js";
import { faviconLinks, pageStyles } from "./styles.js";
import { authPopupScript } from "./scripts.js";

// These types/helpers moved to @ducnmm/octopus-shared; re-exported here until
// the legacy string-template views are deleted.
import {
  toRepoListItem,
  type CommitActorMap,
  type RepoListItem,
  type RepoRefListItem,
  type WebViewer
} from "@ducnmm/octopus-shared";

export { toRepoListItem };
export type { CommitActorMap, RepoListItem, RepoRefListItem, WebViewer };

const shortRef = (ref: string): string => {
  return ref.replace(/^refs\/heads\//, "").replace(/^refs\/tags\//, "");
};

const escapeHtml = (value: string): string => {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
};

const escapeAttr = escapeHtml;

const shortCommit = (commit: string | null): string => {
  return commit ? commit.slice(0, 12) : "No pushes yet";
};

const shortWallet = (walletAddress: string): string => {
  return walletAddress.length > 14 ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : walletAddress;
};

type ActorDisplay = {
  label: string;
  title: string;
};

const isWalletOwnerLabel = (owner: string): boolean => {
  return owner.trim().toLowerCase().startsWith("0x");
};

const actorDisplayForWallet = (repo: RepoListItem, walletAddress: string | undefined): ActorDisplay | null => {
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

const gitActorTitle = (commit: IndexedCommit): string => {
  const name = commit.committerName || commit.authorName || "Octopus";
  const email = commit.committerEmail || commit.authorEmail;
  return email ? `${name} <${email}>` : name;
};

const commitActorDisplay = (repo: RepoListItem, commit: IndexedCommit, commitActors?: CommitActorMap): ActorDisplay => {
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

const pluralize = (count: number, singular: string, plural = `${singular}s`): string => {
  return `${count} ${count === 1 ? singular : plural}`;
};

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const dayMs = 24 * 60 * 60 * 1000;

type ContributionDay = {
  key: string;
  label: string;
  count: number;
  level: number;
  inRange: boolean;
};

type ContributionWeek = {
  monthLabel: string;
  days: ContributionDay[];
};

type ContributionCalendar = {
  total: number;
  weeks: ContributionWeek[];
};

const formatDate = (value: number): string => {
  return new Date(value)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, " UTC");
};

const formatRelativeDate = (value: string | number): string => {
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

const utcDay = (date: Date): Date => {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const addDays = (date: Date, days: number): Date => {
  return new Date(date.getTime() + days * dayMs);
};

const dateKey = (date: Date): string => {
  return date.toISOString().slice(0, 10);
};

const formatContributionDate = (date: Date): string => {
  return `${monthNames[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
};

const formatMonthYear = (date: Date): string => {
  return `${monthNames[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
};

const contributionLevel = (count: number, maxCount: number): number => {
  if (count <= 0) {
    return 0;
  }
  if (maxCount <= 4) {
    return Math.min(4, count);
  }
  return Math.max(1, Math.ceil((count / maxCount) * 4));
};

const buildContributionCalendar = (repos: RepoListItem[]): ContributionCalendar => {
  const today = utcDay(new Date());
  const firstDay = addDays(today, -364);
  const graphStart = addDays(firstDay, -firstDay.getUTCDay());
  const graphEnd = addDays(today, 6 - today.getUTCDay());
  const firstTime = firstDay.getTime();
  const todayTime = today.getTime();
  const counts = new Map<string, number>();

  for (const repo of repos) {
    if (repo.commitDates?.length) {
      for (const value of repo.commitDates) {
        const date = utcDay(new Date(value));
        const time = date.getTime();
        if (Number.isNaN(time) || time < firstTime || time > todayTime) {
          continue;
        }
        const key = dateKey(date);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      continue;
    }

    if (typeof repo.commitCount === "number" && repo.commitCount > 0) {
      const date = utcDay(new Date(repo.updatedAtMs));
      const time = date.getTime();
      if (!Number.isNaN(time) && time >= firstTime && time <= todayTime) {
        const key = dateKey(date);
        counts.set(key, (counts.get(key) ?? 0) + repo.commitCount);
      }
    }
  }

  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const maxCount = Math.max(1, ...counts.values());
  const weeks: ContributionWeek[] = [];

  for (let weekStart = graphStart; weekStart <= graphEnd; weekStart = addDays(weekStart, 7)) {
    const days = Array.from({ length: 7 }, (_, dayIndex) => {
      const date = addDays(weekStart, dayIndex);
      const key = dateKey(date);
      const count = counts.get(key) ?? 0;
      return {
        key,
        label: formatContributionDate(date),
        count,
        level: contributionLevel(count, maxCount),
        inRange: date.getTime() >= firstTime && date.getTime() <= todayTime
      };
    });
    const monthStart = days.find((day) => day.inRange && Number(day.key.slice(8, 10)) === 1);
    const firstInRange = days.find((day) => day.inRange);
    const monthLabel = monthStart
      ? (monthNames[Number(monthStart.key.slice(5, 7)) - 1] ?? "")
      : weeks.length === 0 && firstInRange && Number(firstInRange.key.slice(8, 10)) <= 7
        ? (monthNames[Number(firstInRange.key.slice(5, 7)) - 1] ?? "")
        : "";
    weeks.push({ monthLabel, days });
  }

  return { total, weeks };
};

type ActivityRepoCount = {
  repo: RepoListItem;
  count: number;
};

type ActivityMonth = {
  key: string;
  label: string;
  commitTotal: number;
  commitRepos: ActivityRepoCount[];
  createdRepos: RepoListItem[];
};

const buildContributionActivity = (repos: RepoListItem[]): ActivityMonth[] => {
  const today = utcDay(new Date());
  const firstDay = addDays(today, -364);
  const firstTime = firstDay.getTime();
  const todayTime = today.getTime() + dayMs - 1;
  const months = new Map<string, ActivityMonth>();

  const monthForDate = (date: Date): ActivityMonth => {
    const key = date.toISOString().slice(0, 7);
    const existing = months.get(key);
    if (existing) {
      return existing;
    }

    const month = {
      key,
      label: formatMonthYear(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))),
      commitTotal: 0,
      commitRepos: [],
      createdRepos: []
    };
    months.set(key, month);
    return month;
  };

  for (const repo of repos) {
    const commitsByMonth = new Map<string, number>();
    for (const value of repo.commitDates ?? []) {
      const date = utcDay(new Date(value));
      const time = date.getTime();
      if (Number.isNaN(time) || time < firstTime || time > todayTime) {
        continue;
      }
      const key = date.toISOString().slice(0, 7);
      commitsByMonth.set(key, (commitsByMonth.get(key) ?? 0) + 1);
    }

    for (const [key, count] of commitsByMonth) {
      const [year = "0", month = "1"] = key.split("-");
      const activityMonth = monthForDate(new Date(Date.UTC(Number(year), Number(month) - 1, 1)));
      activityMonth.commitTotal += count;
      activityMonth.commitRepos.push({ repo, count });
    }

    const createdDate = utcDay(new Date(repo.createdAtMs));
    const createdTime = createdDate.getTime();
    if (!Number.isNaN(createdTime) && createdTime >= firstTime && createdTime <= todayTime) {
      monthForDate(createdDate).createdRepos.push(repo);
    }
  }

  return [...months.values()]
    .map((month) => ({
      ...month,
      commitRepos: month.commitRepos.sort((a, b) => b.count - a.count || a.repo.repoId.localeCompare(b.repo.repoId)),
      createdRepos: month.createdRepos.sort((a, b) => b.createdAtMs - a.createdAtMs || a.repoId.localeCompare(b.repoId))
    }))
    .sort((a, b) => b.key.localeCompare(a.key));
};

const joinOriginPath = (origin: string | undefined, path: string): string => {
  return origin ? `${origin.replace(/\/+$/, "")}${path}` : path;
};

const topNavigation = (
  viewer?: WebViewer,
  options: { loginHref?: string; loginLabel?: string; popup?: boolean } = {}
): string => {
  const loginHref = options.loginHref ?? "/login";
  const loginLabel = options.loginLabel ?? "Sign in";
  const popupAttr = options.popup ? " data-octopus-auth-popup" : "";
  const auth = viewer
    ? `<div class="site-auth">
        <span class="site-wallet" title="${escapeAttr(viewer.walletAddress)}">${escapeHtml(shortWallet(viewer.walletAddress))}</span>
        <form class="site-auth-form" method="post" action="/logout">
          <button class="site-auth-button" type="submit">Sign out</button>
        </form>
      </div>`
    : `<div class="site-auth"><a class="site-auth-link" href="${escapeAttr(loginHref)}"${popupAttr}>${escapeHtml(loginLabel)}</a></div>`;

  return `
    <div class="site-topbar">
      <div class="site-topbar-inner">
        <a class="site-brand" href="/" aria-label="Octopus home">
          <img class="site-logo" src="/android-chrome-192x192.png" srcset="/android-chrome-192x192.png 1x, /android-chrome-512x512.png 2x" alt="" width="32" height="32">
          <strong>Octopus</strong>
        </a>
        ${auth}
      </div>
    </div>`;
};

const branchIcon = `<svg class="branch-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="3" r="1.7"></circle><circle cx="5" cy="13" r="1.7"></circle><circle cx="11" cy="4" r="1.7"></circle><path d="M5 4.7v6.6"></path><path d="M11 5.7v.8A2.5 2.5 0 0 1 8.5 9H5"></path></svg>`;

const codeIcon = `<svg class="code-icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M5.22 4.22a.75.75 0 0 1 0 1.06L2.5 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L.97 8.59a.83.83 0 0 1 0-1.18l3.19-3.19a.75.75 0 0 1 1.06 0Zm5.56 0a.75.75 0 0 1 1.06 0l3.19 3.19a.83.83 0 0 1 0 1.18l-3.19 3.19a.75.75 0 1 1-1.06-1.06L13.5 8l-2.72-2.72a.75.75 0 0 1 0-1.06Z"></path></svg>`;

const copyIcon = `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M0 6.75A2.75 2.75 0 0 1 2.75 4h1.5a.75.75 0 0 1 0 1.5h-1.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25v-1.5a.75.75 0 0 1 1.5 0v1.5A2.75 2.75 0 0 1 9.25 16h-6.5A2.75 2.75 0 0 1 0 13.25Zm4-4A2.75 2.75 0 0 1 6.75 0h6.5A2.75 2.75 0 0 1 16 2.75v6.5A2.75 2.75 0 0 1 13.25 12h-6.5A2.75 2.75 0 0 1 4 9.25Zm2.75-1.25c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25Z"></path></svg>`;

const entryFolderIcon = `<svg class="entry-icon folder" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.75 4.25A1.25 1.25 0 0 1 3 3h3l1.25 1.5H13A1.25 1.25 0 0 1 14.25 5.75v6A1.25 1.25 0 0 1 13 13H3a1.25 1.25 0 0 1-1.25-1.25Z"></path></svg>`;
const entryFileIcon = `<svg class="entry-icon file" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.25 1.75h5L12.75 5v9.25h-8.5Z"></path><path d="M9.25 1.75V5h3.5"></path></svg>`;

const treeEntryIcon = (entry: TreeEntry): string => {
  return entry.type === "tree" ? entryFolderIcon : entryFileIcon;
};

const navIcon = (paths: string): string => {
  return `<svg class="repo-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
};

const navCodeIcon = navIcon(`<path d="m6 4-4 4 4 4"></path><path d="m10 4 4 4-4 4"></path>`);
const navPullRequestIcon = navIcon(
  `<circle cx="5" cy="3" r="1.7"></circle><circle cx="5" cy="13" r="1.7"></circle><path d="M5 4.7v6.6"></path><path d="M11 3v3.5A2.5 2.5 0 0 1 8.5 9H5"></path><path d="m9.2 7 2 2-2 2"></path>`
);
const navCommitIcon = navIcon(
  `<path d="M2 8h4"></path><circle cx="8" cy="8" r="2.1"></circle><path d="M10 8h4"></path>`
);
const navActivityIcon = navIcon(
  `<path d="M3 3.5v8.25A1.25 1.25 0 0 0 4.25 13H13"></path><path d="M5 10.5 7.5 8l2 1.5L13 5.5"></path>`
);
const navSettingsIcon = navIcon(
  `<circle cx="8" cy="8" r="2.05"></circle><path d="M8 1.75v1.35"></path><path d="M8 12.9v1.35"></path><path d="M2.42 4.75 3.6 5.43"></path><path d="m12.4 10.57 1.18.68"></path><path d="M2.42 11.25 3.6 10.57"></path><path d="m12.4 5.43 1.18-.68"></path><path d="M5.2 2.5 5.85 3.7"></path><path d="m10.15 12.3.65 1.2"></path><path d="m5.2 13.5.65-1.2"></path><path d="m10.15 3.7.65-1.2"></path>`
);

const aboutIcon = (path: string): string => {
  return `<svg class="repo-about-icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="${path}"></path></svg>`;
};

const readmeIcon = aboutIcon(
  "M2.75 1.5A1.75 1.75 0 0 0 1 3.25v9.5c0 .97.78 1.75 1.75 1.75h3.5c.64 0 1.23.23 1.7.61a.75.75 0 0 0 .1.07.75.75 0 0 0 .9-.07c.47-.38 1.06-.61 1.7-.61h2.6A1.75 1.75 0 0 0 15 12.75v-9.5a1.75 1.75 0 0 0-1.75-1.75h-2.6c-.8 0-1.55.24-2.15.66A3.68 3.68 0 0 0 6.35 1.5Zm.75 1.75c0-.14.11-.25.25-.25h2.6c.55 0 1.05.17 1.45.46v9.55a5.18 5.18 0 0 0-1.55-.26h-3.5a.25.25 0 0 1-.25-.25Zm6.15-.25h2.6c.14 0 .25.11.25.25v9.5a.25.25 0 0 1-.25.25h-2.6c-.54 0-1.06.09-1.55.26V3.46c.4-.29.9-.46 1.55-.46Z"
);
const activityIcon = aboutIcon(
  "M8 1.25a.75.75 0 0 1 .75.75v5.69l3.02 1.81a.75.75 0 0 1-.77 1.29l-3.39-2.03A.75.75 0 0 1 7.25 8V2A.75.75 0 0 1 8 1.25ZM8 14.5A6.5 6.5 0 1 0 8 1.5a.75.75 0 0 1 0-1.5 8 8 0 1 1-8 8 .75.75 0 0 1 1.5 0A6.5 6.5 0 0 0 8 14.5Z"
);
const commitIcon = aboutIcon(
  "M7.25 10.4A2.75 2.75 0 0 1 5.35 8.5H2a.75.75 0 0 1 0-1.5h3.35a2.75 2.75 0 0 1 5.3 0H14a.75.75 0 0 1 0 1.5h-3.35a2.75 2.75 0 0 1-1.9 1.9V14a.75.75 0 0 1-1.5 0Zm.75-1.3A1.25 1.25 0 1 0 8 6.6a1.25 1.25 0 0 0 0 2.5Z"
);
const packageIcon = aboutIcon(
  "M8.32.18a.75.75 0 0 0-.64 0l-6 2.75A.75.75 0 0 0 1.25 3.6v8.8c0 .3.18.58.46.7l6 2.75c.2.09.43.09.63 0l6-2.75c.27-.12.45-.4.45-.7V3.6a.75.75 0 0 0-.44-.68Zm-.32 1.5 4.18 1.92L8 5.52 3.82 3.6Zm-.75 5.14v7.2l-4.5-2.06V4.76Zm1.5 7.2v-7.2l4.5-2.06v7.2Z"
);

type BranchSelectorTarget = {
  view: "tree" | "commits" | "blob";
  path?: string;
};

type RepoHeaderView = "activity" | "code" | "pulls" | "commits" | "settings";

const repoBasePath = (repo: RepoListItem): string => {
  return `/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
};

const sameRef = (left: string, right: string): boolean => {
  return shortRef(left) === shortRef(right);
};

const hrefWithQuery = (path: string, params: Record<string, string | undefined>): string => {
  const query = Object.entries(params)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return query ? `${path}?${query}` : path;
};

const branchTargetHref = (repo: RepoListItem, branch: RepoRefListItem, target: BranchSelectorTarget): string => {
  const ref = branch.shortName;
  if (target.view === "commits") {
    return hrefWithQuery(`${repoBasePath(repo)}/commits`, { ref });
  }
  if (target.view === "blob") {
    return hrefWithQuery(`${repoBasePath(repo)}/blob`, { ref, path: target.path });
  }
  return hrefWithQuery(`${repoBasePath(repo)}/tree`, { ref, path: target.path });
};

const renderBranchSelector = (repo: RepoListItem, ref: string, target: BranchSelectorTarget): string => {
  const currentShortRef = shortRef(ref);
  const branches =
    repo.refs.length > 0
      ? repo.refs
      : [
          {
            name: repo.defaultBranch,
            shortName: shortRef(repo.defaultBranch),
            commitDigest: repo.defaultBranchCommit ?? "",
            updatedAtMs: repo.updatedAtMs,
            isDefault: true
          }
        ];

  const branchItems = branches
    .map((branch) => {
      const isActive = sameRef(branch.name, currentShortRef) || branch.shortName === currentShortRef;
      const className = isActive ? "branch-option is-active" : "branch-option";
      const defaultLabel = branch.isDefault ? `<span class="branch-default">default</span>` : "";
      return `<a class="${className}" href="${escapeAttr(branchTargetHref(repo, branch, target))}">
          <span class="branch-option-main">
            <span class="branch-option-name">${escapeHtml(branch.shortName)}</span>
            ${defaultLabel}
          </span>
          <span class="branch-option-sha">${escapeHtml(shortCommit(branch.commitDigest))}</span>
        </a>`;
    })
    .join("");

  return `<details class="branch-dropdown">
      <summary class="branch-trigger">${branchIcon}<span class="branch-trigger-label">${escapeHtml(currentShortRef)}</span></summary>
      <div class="branch-menu">
        <div class="branch-menu-heading">Switch branches</div>
        <div class="branch-list">${branchItems}</div>
      </div>
    </details>`;
};

const commitCountForRef = (index: RepoIndex, ref: string, commits: IndexedCommit[]): number => {
  return sameRef(ref, index.defaultBranch) ? index.commitCount : commits.length;
};

const repoNav = (repo: RepoListItem, active: RepoHeaderView, viewer?: WebViewer): string => {
  const base = repoBasePath(repo);
  const links: Array<{ view: RepoHeaderView; href: string; icon: string; label: string; count?: number }> = [
    { view: "code", href: base, icon: navCodeIcon, label: "Code" },
    {
      view: "pulls",
      href: `${base}/pulls`,
      icon: navPullRequestIcon,
      label: "Pull requests",
      count: repo.pullRequestCount
    },
    { view: "commits", href: `${base}/commits`, icon: navCommitIcon, label: "Commits", count: repo.commitCount },
    { view: "activity", href: `${base}/activity`, icon: navActivityIcon, label: "Activity", count: repo.activityCount }
  ];
  if (canManageRepoAccess(repo, viewer)) {
    links.push({ view: "settings", href: `${base}/settings/access`, icon: navSettingsIcon, label: "Settings" });
  }

  return `<nav class="repo-nav" aria-label="Repository navigation">
      ${links
        .map((link) => {
          const className = link.view === active ? "repo-nav-link is-active" : "repo-nav-link";
          const count =
            typeof link.count === "number"
              ? `<span class="repo-nav-count" aria-label="${escapeAttr(`${link.count} ${link.label}`)}">${escapeHtml(String(link.count))}</span>`
              : "";
          return `<a class="${className}" href="${escapeAttr(link.href)}">${link.icon}<span>${escapeHtml(link.label)}</span>${count}</a>`;
        })
        .join("")}
    </nav>`;
};

const repoHeader = (
  repo: RepoListItem,
  subtitle: string,
  active: RepoHeaderView = "code",
  viewer?: WebViewer
): string => {
  const repoHref = `/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
  const ownerHref = `/${encodeURIComponent(repo.owner)}`;

  return `<header>
      <div class="bar">
        <div class="repo-header-main">
          <h1>
            <span class="repo-title-path">
              <a class="repo-title-owner" href="${ownerHref}">${escapeHtml(repo.owner)}</a>
              <span>/</span>
              <a class="repo-title-name" href="${repoHref}">${escapeHtml(repo.name)}</a>
            </span>
          </h1>
          <p class="repo-subtitle">${escapeHtml(subtitle)}</p>
          ${repoNav(repo, active, viewer)}
        </div>
        <div class="meta visibility-meta"><span class="badge">${escapeHtml(repo.visibility)}</span></div>
      </div>
    </header>`;
};

const canManageRepoAccess = (repo: RepoListItem, viewer?: WebViewer): boolean => {
  if (!viewer) {
    return false;
  }

  const walletAddress = viewer.walletAddress.toLowerCase();
  return walletAddress === repo.ownerWallet.toLowerCase() || walletAddress === repo.owner.toLowerCase();
};

const canWritePullRequests = (repo: RepoListItem, viewer?: WebViewer): boolean => {
  if (!viewer) {
    return false;
  }

  const walletAddress = viewer.walletAddress.toLowerCase();
  return (
    walletAddress === repo.ownerWallet.toLowerCase() ||
    walletAddress === repo.owner.toLowerCase() ||
    repo.writers.map((writer) => writer.toLowerCase()).includes(walletAddress)
  );
};

const repoAccessAction = (repo: RepoListItem): string => {
  return `/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/contributors`;
};

const repoAccessHref = (repo: RepoListItem): string => {
  return `${repoBasePath(repo)}/settings/access`;
};

const repoUsesWalletAccess = (repo: RepoListItem): boolean => {
  return !repo.repoObjectId.startsWith("local:");
};

const renderReturnToField = (returnTo?: string): string => {
  return returnTo ? `<input type="hidden" name="returnTo" value="${escapeAttr(returnTo)}">` : "";
};

const renderWalletAccessFields = (
  repo: RepoListItem,
  input: {
    action: "add" | "remove";
    role?: "reader" | "writer";
    walletAddress?: string;
  },
  returnTo?: string
): string => {
  return [
    `<input type="hidden" name="mode" value="access">`,
    `<input type="hidden" name="autostart" value="1">`,
    `<input type="hidden" name="owner" value="${escapeAttr(repo.owner)}">`,
    `<input type="hidden" name="ownerWallet" value="${escapeAttr(repo.ownerWallet)}">`,
    `<input type="hidden" name="repo" value="${escapeAttr(repo.name)}">`,
    `<input type="hidden" name="repoObjectId" value="${escapeAttr(repo.repoObjectId)}">`,
    `<input type="hidden" name="action" value="${input.action}">`,
    input.role ? `<input type="hidden" name="role" value="${input.role}">` : "",
    input.walletAddress ? `<input type="hidden" name="walletAddress" value="${escapeAttr(input.walletAddress)}">` : "",
    renderReturnToField(returnTo)
  ]
    .filter(Boolean)
    .join("");
};

const renderContributorRows = (repo: RepoListItem, returnTo?: string): string => {
  const writers = new Set(repo.writers.map((wallet) => wallet.toLowerCase()));
  const readers = repo.readers.map((wallet) => wallet.toLowerCase()).filter((wallet) => !writers.has(wallet));
  const entries = [
    ...[...writers].sort().map((walletAddress) => ({ walletAddress, role: "writer" as const, label: "Writer" })),
    ...readers.sort().map((walletAddress) => ({ walletAddress, role: "reader" as const, label: "Reader" }))
  ];

  if (entries.length === 0) {
    return `<p class="access-empty">No contributors added yet.</p>`;
  }

  const action = repoAccessAction(repo);
  const walletAccess = repoUsesWalletAccess(repo);
  const returnToField = renderReturnToField(returnTo);
  return `<div class="access-list">
      ${entries
        .map(
          (entry) => `<div class="access-row">
        <span class="access-wallet" title="${escapeAttr(entry.walletAddress)}">${escapeHtml(shortWallet(entry.walletAddress))}</span>
        <span class="access-role">${entry.label}</span>
        <form method="${walletAccess ? "get" : "post"}" action="${escapeAttr(walletAccess ? "/login" : action)}"${walletAccess ? ` data-octopus-access-form` : ""}>
          ${
            walletAccess
              ? renderWalletAccessFields(
                  repo,
                  {
                    action: "remove",
                    role: entry.role,
                    walletAddress: entry.walletAddress
                  },
                  returnTo
                )
              : `<input type="hidden" name="action" value="remove">
              <input type="hidden" name="role" value="${entry.role}">
              <input type="hidden" name="walletAddress" value="${escapeAttr(entry.walletAddress)}">
              ${returnToField}`
          }
          <button class="github-button compact" type="submit">Remove</button>
        </form>
      </div>`
        )
        .join("")}
    </div>`;
};

const renderRepoAccessPanel = (repo: RepoListItem, viewer?: WebViewer, returnTo?: string): string => {
  if (!canManageRepoAccess(repo, viewer)) {
    return "";
  }

  const action = repoAccessAction(repo);
  const walletAccess = repoUsesWalletAccess(repo);
  const returnToField = renderReturnToField(returnTo);
  return `<div class="access-panel">
      <h2 class="clone-heading">Contributors</h2>
      <form class="access-form" method="${walletAccess ? "get" : "post"}" action="${escapeAttr(walletAccess ? "/login" : action)}"${walletAccess ? ` data-octopus-access-form` : ""}>
        ${
          walletAccess
            ? renderWalletAccessFields(repo, { action: "add" }, returnTo)
            : `<input type="hidden" name="action" value="add">${returnToField}`
        }
        <input class="access-input" name="walletAddress" placeholder="0x wallet address" autocomplete="off" required>
        <select class="access-select" name="role" aria-label="Contributor role">
          <option value="writer">Writer</option>
          <option value="reader">Reader</option>
        </select>
        <button class="github-button primary" type="submit">Add</button>
      </form>
      ${renderContributorRows(repo, returnTo)}
    </div>`;
};

const pullRequestAction = (repo: RepoListItem): string => {
  return `${repoBasePath(repo)}/pulls`;
};

const pullRequestCreateHref = (repo: RepoListItem): string => {
  return `${repoBasePath(repo)}/pulls/new`;
};

const pullRequestHref = (repo: RepoListItem, pullRequest: PullRequest): string => {
  return `${repoBasePath(repo)}/pulls/${pullRequest.number}`;
};

const branchOptions = (repo: RepoListItem, selectedRef: string, includeEmpty = false): string => {
  const branches =
    repo.refs.length > 0
      ? repo.refs
      : [
          {
            name: repo.defaultBranch,
            shortName: shortRef(repo.defaultBranch),
            commitDigest: repo.defaultBranchCommit ?? "",
            updatedAtMs: repo.updatedAtMs,
            isDefault: true
          }
        ];
  const empty = includeEmpty ? `<option value="" disabled selected>Select branch</option>` : "";
  return `${empty}${branches
    .map((branch) => {
      const selected = !includeEmpty && sameRef(branch.name, selectedRef) ? " selected" : "";
      return `<option value="${escapeAttr(branch.shortName)}"${selected}>${escapeHtml(branch.shortName)}</option>`;
    })
    .join("")}`;
};

const renderPullRequestCreatePanel = (repo: RepoListItem, viewer?: WebViewer): string => {
  if (!canWritePullRequests(repo, viewer)) {
    return "";
  }

  return `<section class="panel">
      <h2>Open pull request</h2>
      <form class="pull-request-form" method="post" action="${escapeAttr(pullRequestAction(repo))}">
        <div class="pull-request-grid">
          <div class="form-field">
            <label for="baseRef">Base</label>
            <select class="pull-request-select" id="baseRef" name="baseRef" required>
              ${branchOptions(repo, repo.defaultBranch)}
            </select>
          </div>
          <div class="form-field">
            <label for="headRef">Head</label>
            <select class="pull-request-select" id="headRef" name="headRef" required>
              ${branchOptions(repo, "", true)}
            </select>
          </div>
        </div>
        <div class="form-field">
          <label for="title">Title</label>
          <input class="pull-request-input" id="title" name="title" maxlength="200" autocomplete="off" required>
        </div>
        <div class="form-field">
          <label for="body">Description</label>
          <textarea class="pull-request-textarea" id="body" name="body" maxlength="10000"></textarea>
        </div>
        <div>
          <button class="github-button primary" type="submit">Open pull request</button>
        </div>
      </form>
    </section>`;
};

const plusIcon = `<svg class="button-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10"></path><path d="M3 8h10"></path></svg>`;

const renderCreateRepoPanel = (viewer?: WebViewer, loginHref = "/login"): string => {
  if (!viewer) {
    return `<section class="private-gate" aria-label="Create repository sign in">
      <h2>Create new repository</h2>
      <p>Sign in with your Sui wallet before creating a repository.</p>
      <div class="private-gate-actions">
        <a class="github-button primary" href="${escapeAttr(loginHref)}" data-octopus-auth-popup>Sign in with Sui wallet</a>
      </div>
    </section>`;
  }

  return `<section class="panel create-repo-panel" aria-label="Create repository form">
      <h2>Create new repository</h2>
      <p class="create-repo-lead">Start with an empty Git repository owned by your wallet namespace.</p>
      <form class="create-repo-form" method="post" action="/v1/repos">
        <div class="create-repo-name-grid">
          <div class="form-field">
            <label for="owner">Owner namespace</label>
            <input class="create-repo-input" id="owner" name="owner" maxlength="235" autocomplete="off" placeholder="${escapeAttr(shortWallet(viewer.walletAddress))}" pattern="[A-Za-z0-9._-]+">
            <p class="create-repo-help">Leave blank to use your wallet or primary SuiNS name.</p>
          </div>
          <span class="create-repo-divider" aria-hidden="true">/</span>
          <div class="form-field">
            <label for="name">Repository name</label>
            <input class="create-repo-input" id="name" name="name" maxlength="100" autocomplete="off" pattern="[A-Za-z0-9._-]+" required>
            <p class="create-repo-help">Letters, numbers, dots, underscores, and hyphens.</p>
          </div>
        </div>
        <fieldset class="form-field">
          <legend class="form-field-label">Visibility</legend>
          <div class="visibility-options">
            <label class="visibility-option">
              <input type="radio" name="visibility" value="public" checked>
              <span>
                <span class="visibility-title">Public</span>
                <span class="visibility-copy">Anyone can find and clone this repository.</span>
              </span>
            </label>
            <label class="visibility-option">
              <input type="radio" name="visibility" value="private">
              <span>
                <span class="visibility-title">Private</span>
                <span class="visibility-copy">Only the owner and invited contributors can access it.</span>
              </span>
            </label>
          </div>
        </fieldset>
        <div class="create-repo-actions">
          <button class="github-button primary" type="submit">${plusIcon}<span>Create repository</span></button>
          <a class="github-button" href="/">Cancel</a>
        </div>
      </form>
    </section>`;
};

const renderNewPullRequestButton = (repo: RepoListItem, viewer?: WebViewer): string => {
  if (!canWritePullRequests(repo, viewer)) {
    return "";
  }

  return `<a class="github-button primary" href="${escapeAttr(pullRequestCreateHref(repo))}">${plusIcon}<span>New pull request</span></a>`;
};

const pullRequestStatusBadge = (status: PullRequest["status"]): string => {
  return `<span class="badge status-${escapeAttr(status)}">${escapeHtml(status)}</span>`;
};

const renderPullRequestRows = (repo: RepoListItem, pullRequests: PullRequest[]): string => {
  if (pullRequests.length === 0) {
    return `<tr><td colspan="5" class="empty">No pull requests yet.</td></tr>`;
  }

  return pullRequests
    .map((pullRequest) => {
      const href = pullRequestHref(repo, pullRequest);
      const author = actorDisplayForWallet(repo, pullRequest.authorWalletAddress) ?? {
        label: shortWallet(pullRequest.authorWalletAddress),
        title: pullRequest.authorWalletAddress
      };
      return `<tr>
          <td>${pullRequestStatusBadge(pullRequest.status)}</td>
          <td>
            <div class="pull-request-title">
              <a href="${escapeAttr(href)}">${escapeHtml(pullRequest.title)}</a>
              <span class="pull-request-number">#${pullRequest.number}</span>
            </div>
            <div class="pull-request-branches">${escapeHtml(shortRef(pullRequest.headRef))} into ${escapeHtml(shortRef(pullRequest.baseRef))}</div>
          </td>
          <td title="${escapeAttr(author.title)}">${escapeHtml(author.label)}</td>
          <td><code title="${escapeAttr(pullRequest.headCommit)}">${escapeHtml(pullRequest.headCommit.slice(0, 8))}</code></td>
          <td class="file-time-cell" title="${escapeAttr(formatDate(pullRequest.updatedAtMs))}">${escapeHtml(formatRelativeDate(pullRequest.updatedAtMs))}</td>
        </tr>`;
    })
    .join("");
};

const renderPullRequestCommitRows = (
  repo: RepoListItem,
  commits: IndexedCommit[],
  commitActors?: CommitActorMap
): string => {
  if (commits.length === 0) {
    return `<tr><td colspan="4" class="empty">No commits in this comparison.</td></tr>`;
  }

  return commits
    .map((commit) => {
      const actor = commitActorDisplay(repo, commit, commitActors);
      return `<tr>
        <td><code title="${escapeAttr(commit.oid)}">${escapeHtml(commit.oid.slice(0, 8))}</code></td>
        <td><div class="commit-message" title="${escapeAttr(commit.subject)}">${escapeHtml(commit.subject)}</div></td>
        <td title="${escapeAttr(actor.title)}">${escapeHtml(actor.label)}</td>
        <td class="file-time-cell" title="${escapeAttr(commit.authoredAt)}">${escapeHtml(formatRelativeDate(commit.authoredAt))}</td>
      </tr>`;
    })
    .join("");
};

const renderPullRequestFileRows = (comparison: PullRequestComparison): string => {
  if (comparison.files.length === 0) {
    return `<tr><td colspan="3" class="empty">No file changes in this comparison.</td></tr>`;
  }

  return comparison.files
    .map(
      (file) => `<tr>
        <td><span class="entry-name" title="${escapeAttr(file.path)}">${escapeHtml(file.path)}</span></td>
        <td class="diff-stat"><span class="diff-additions">+${file.additions}</span></td>
        <td class="diff-stat"><span class="diff-deletions">-${file.deletions}</span>${file.binary ? " binary" : ""}</td>
      </tr>`
    )
    .join("");
};

const renderRepoCards = (repos: RepoListItem[], emptyMessage: string): string => {
  return repos.length === 0
    ? `<div class="empty">${escapeHtml(emptyMessage)}</div>`
    : repos
        .map((repo) => {
          const repoId = escapeHtml(repo.repoId);
          const repoHref = `/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
          const commitMeta =
            typeof repo.commitCount === "number" ? `<li>${escapeHtml(pluralize(repo.commitCount, "commit"))}</li>` : "";

          return `<article class="repo-list-item">
              <div class="repo-list-main">
                <div>
                  <h2 class="repo-list-title"><a href="${repoHref}" title="${repoId}">${repoId}</a><span class="badge">${escapeHtml(repo.visibility)}</span></h2>
                  <ul class="repo-list-meta">
                    <li>${escapeHtml(pluralize(repo.refCount, "branch", "branches"))}</li>
                    ${commitMeta}
                    <li>Updated ${escapeHtml(formatRelativeDate(repo.updatedAtMs))}</li>
                  </ul>
                </div>
                <div class="repo-list-action"><a class="github-button" href="${repoHref}">View repository</a></div>
              </div>
            </article>`;
        })
        .join("");
};

const renderPopularRepoCards = (repos: RepoListItem[], emptyMessage: string): string => {
  if (repos.length === 0) {
    return `<section class="repo-list" aria-label="Repositories"><div class="empty">${escapeHtml(emptyMessage)}</div></section>`;
  }

  return `<section class="popular-repo-grid" aria-label="Popular repositories">
    ${repos
      .slice(0, 6)
      .map((repo) => {
        const repoHref = `/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
        const commitMeta =
          typeof repo.commitCount === "number" ? `<li>${escapeHtml(pluralize(repo.commitCount, "commit"))}</li>` : "";

        return `<article class="popular-repo-card">
        <div class="popular-repo-card-header">
          <a class="popular-repo-title" href="${repoHref}" title="${escapeAttr(repo.repoId)}">${escapeHtml(repo.name)}</a>
          <span class="badge">${escapeHtml(repo.visibility)}</span>
        </div>
        <ul class="popular-repo-meta">
          <li><span class="repo-dot" aria-hidden="true"></span>${escapeHtml(pluralize(repo.refCount, "branch", "branches"))}</li>
          ${commitMeta}
          <li>Updated ${escapeHtml(formatRelativeDate(repo.updatedAtMs))}</li>
        </ul>
      </article>`;
      })
      .join("")}
  </section>`;
};

const renderContributionCalendar = (repos: RepoListItem[]): string => {
  const calendar = buildContributionCalendar(repos);
  const currentYear = new Date().getFullYear();
  const months = calendar.weeks
    .map((week) => `<span class="contribution-month">${escapeHtml(week.monthLabel)}</span>`)
    .join("");
  const weeks = calendar.weeks
    .map((week) => {
      const days = week.days
        .map((day) => {
          const commitLabel = `${pluralize(day.count, "commit")} on ${day.label}`;
          const className = ["contribution-day", `level-${day.level}`, day.inRange ? "" : "is-outside"]
            .filter(Boolean)
            .join(" ");
          return `<span class="${className}" title="${escapeAttr(commitLabel)}" aria-label="${escapeAttr(commitLabel)}"></span>`;
        })
        .join("");
      return `<span class="contribution-week">${days}</span>`;
    })
    .join("");

  return `<section class="contribution-section" aria-label="Contribution graph">
    <div class="contribution-heading">
      <h2>${escapeHtml(pluralize(calendar.total, "contribution"))} in the last year</h2>
      <span class="contribution-year">${currentYear}</span>
    </div>
    <div class="contribution-card">
      <div class="contribution-calendar">
        <div class="contribution-months" aria-hidden="true">${months}</div>
        <div class="contribution-body">
          <div class="contribution-weekdays" aria-hidden="true">
            <span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span>
          </div>
          <div class="contribution-weeks">${weeks}</div>
        </div>
        <div class="contribution-footer" aria-hidden="true">
          <span>Less</span>
          <span class="contribution-legend">
            <span class="contribution-day level-0"></span>
            <span class="contribution-day level-1"></span>
            <span class="contribution-day level-2"></span>
            <span class="contribution-day level-3"></span>
            <span class="contribution-day level-4"></span>
          </span>
          <span>More</span>
        </div>
      </div>
    </div>
  </section>`;
};

const renderContributionActivity = (repos: RepoListItem[]): string => {
  const months = buildContributionActivity(repos);
  if (months.length === 0) {
    return `<section class="activity-section" aria-label="Contribution activity">
      <h2 class="activity-heading">Contribution activity</h2>
      <div class="empty">No contribution activity in the last year.</div>
    </section>`;
  }

  const monthItems = months
    .map((month) => {
      const groups: string[] = [];
      if (month.commitTotal > 0) {
        const repoCount = month.commitRepos.length;
        const maxCount = Math.max(1, ...month.commitRepos.map((item) => item.count));
        const commitRows = month.commitRepos
          .slice(0, 6)
          .map((item) => {
            const repoHref = `/${encodeURIComponent(item.repo.owner)}/${encodeURIComponent(item.repo.name)}`;
            const scale = Math.max(0.08, item.count / maxCount).toFixed(3);
            return `<li>
              <a class="activity-repo-link" href="${repoHref}" title="${escapeAttr(item.repo.repoId)}">${escapeHtml(item.repo.repoId)}</a>
              <span class="activity-meta"><span class="activity-bar" style="--activity-scale:${scale}"></span> ${escapeHtml(pluralize(item.count, "commit"))}</span>
            </li>`;
          })
          .join("");
        groups.push(`<article class="activity-group">
          <span class="activity-icon" aria-hidden="true">↗</span>
          <div class="activity-content">
            <h3 class="activity-title">Created ${escapeHtml(pluralize(month.commitTotal, "commit"))} in ${escapeHtml(pluralize(repoCount, "repository", "repositories"))}</h3>
            <ul class="activity-list">${commitRows}</ul>
          </div>
        </article>`);
      }

      if (month.createdRepos.length > 0) {
        const createdRows = month.createdRepos
          .slice(0, 6)
          .map((repo) => {
            const repoHref = `/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
            const createdAt = formatContributionDate(new Date(repo.createdAtMs));
            return `<li>
              <a class="activity-repo-link" href="${repoHref}" title="${escapeAttr(repo.repoId)}">${escapeHtml(repo.repoId)}</a>
              <span class="activity-meta">${escapeHtml(repo.visibility)} · ${escapeHtml(createdAt)}</span>
            </li>`;
          })
          .join("");
        groups.push(`<article class="activity-group">
          <span class="activity-icon" aria-hidden="true">□</span>
          <div class="activity-content">
            <h3 class="activity-title">Created ${escapeHtml(pluralize(month.createdRepos.length, "repository", "repositories"))}</h3>
            <ul class="activity-list">${createdRows}</ul>
          </div>
        </article>`);
      }

      return `<section class="activity-month" aria-label="${escapeAttr(month.label)} activity">
        <h3 class="activity-month-heading">${escapeHtml(month.label)}</h3>
        ${groups.join("")}
      </section>`;
    })
    .join("");

  return `<section class="activity-section" aria-label="Contribution activity">
    <h2 class="activity-heading">Contribution activity</h2>
    <div class="activity-timeline">${monthItems}</div>
  </section>`;
};

export const renderLandingPage = (input: { loginHref: string }): string => {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Octopus</title>
${faviconLinks}
    <style>
${pageStyles}
    </style>
  </head>
  <body>
    <main class="landing-page">
      <section class="landing-shell" aria-label="Octopus home">
        <svg class="landing-filter-defs" aria-hidden="true" focusable="false">
          <filter id="landing-mascot-defringe" color-interpolation-filters="sRGB">
            <feMorphology in="SourceAlpha" operator="erode" radius="1" result="eroded"></feMorphology>
            <feComposite in="SourceAlpha" in2="eroded" operator="out" result="edge"></feComposite>
            <feFlood flood-color="#03060a" flood-opacity="0.42" result="edge-color"></feFlood>
            <feComposite in="edge-color" in2="edge" operator="in" result="edge-overlay"></feComposite>
            <feComposite in="edge-overlay" in2="SourceGraphic" operator="over"></feComposite>
          </filter>
        </svg>
        <img class="landing-aurora" src="/assets/aurora-home.avif?v=octopus-home-v1" alt="" aria-hidden="true" fetchpriority="high">
        <img class="landing-mascot" src="/assets/octopus-walrus-mascot.png?v=octopus-home-v2" alt="" aria-hidden="true" fetchpriority="high">
        <header class="landing-header">
          <a class="landing-logo" href="/" aria-label="Octopus home">octopus</a>
          <a class="landing-docs" href="/docs">View docs <span aria-hidden="true">→</span></a>
        </header>
        <section class="landing-hero" aria-labelledby="landing-title">
          <h1 class="landing-title" id="landing-title">
            <span>Git for code</span>
            <span>you control</span>
          </h1>
          <p class="landing-description">
            Octopus is a wallet-native Git platform for builders on Sui. Create repositories,
            manage access, and collaborate with cryptographic identity without leaving your Git workflow.
          </p>
          <div class="landing-actions">
            <a class="landing-connect" href="${escapeAttr(input.loginHref)}" data-octopus-auth-popup>Connect wallet <span aria-hidden="true">↗</span></a>
          </div>
        </section>
      </section>
    </main>
${authPopupScript}
  </body>
</html>`;
};

export const renderCreateRepoPage = (input: { viewer?: WebViewer; loginHref: string }): string => {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>New repository - Octopus</title>
${faviconLinks}
    <style>
${pageStyles}
    </style>
  </head>
  <body>
${topNavigation(input.viewer, { loginHref: input.loginHref, popup: true })}
    <header>
      <div class="bar">
        <div class="repo-header-main">
          <h1>New repository</h1>
          <p class="repo-subtitle">Create a recoverable Git repository backed by Sui and Walrus.</p>
        </div>
      </div>
    </header>
    <main>
      <div class="create-repo-layout">
        ${renderCreateRepoPanel(input.viewer, input.loginHref)}
      </div>
    </main>
${authPopupScript}
  </body>
</html>`;
};

export const renderDashboardPage = (repos: RepoListItem[], viewer?: WebViewer): string => {
  const latestRepos = [...repos].sort((left, right) => right.updatedAtMs - left.updatedAtMs);
  const totalCommits = repos.reduce((sum, repo) => sum + (repo.commitCount ?? 0), 0);
  const totalBranches = repos.reduce((sum, repo) => sum + repo.refCount, 0);
  const feedRepos = latestRepos.slice(0, 6);

  const feedCards = feedRepos.length
    ? feedRepos
        .map((repo) => {
          const repoHref = `/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
          const updatedAt = formatRelativeDate(repo.updatedAtMs);

          return `<article class="dashboard-feed-card">
            <div class="dashboard-feed-head">
              <div class="dashboard-feed-title">
                <img class="dashboard-feed-avatar" src="/android-chrome-192x192.png" alt="" width="28" height="28">
                <span><strong>${escapeHtml(repo.owner)}</strong> updated a repository</span>
              </div>
              <span>${escapeHtml(updatedAt)}</span>
            </div>
            <div class="dashboard-feed-repo">
              <div class="dashboard-feed-repo-head">
                <a class="dashboard-feed-repo-title" href="${repoHref}" title="${escapeAttr(repo.repoId)}">${escapeHtml(repo.repoId)}</a>
                <span class="badge">${escapeHtml(repo.visibility)}</span>
              </div>
              <ul class="repo-list-meta">
                <li>${escapeHtml(pluralize(repo.refCount, "branch", "branches"))}</li>
                <li>${escapeHtml(pluralize(repo.commitCount ?? 0, "commit"))}</li>
                <li>Updated ${escapeHtml(updatedAt)}</li>
              </ul>
            </div>
          </article>`;
        })
        .join("")
    : `<article class="dashboard-feed-card empty">No repositories have been created yet.</article>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Dashboard - Octopus</title>
${faviconLinks}
    <style>
${pageStyles}
    </style>
  </head>
  <body>
${topNavigation(viewer)}
    <main class="dashboard-page">
      <section class="dashboard-layout" aria-label="Dashboard">
        <section class="dashboard-main">
          <h1 class="dashboard-home-title">Home</h1>
          <div class="dashboard-summary" aria-label="Repository summary">
            <article class="dashboard-stat-card">
              <strong>${repos.length}</strong>
              <span>${escapeHtml(repos.length === 1 ? "repository" : "repositories")}</span>
            </article>
            <article class="dashboard-stat-card">
              <strong>${totalCommits}</strong>
              <span>${escapeHtml(totalCommits === 1 ? "commit" : "commits")}</span>
            </article>
            <article class="dashboard-stat-card">
              <strong>${totalBranches}</strong>
              <span>${escapeHtml(totalBranches === 1 ? "branch" : "branches")}</span>
            </article>
          </div>
          <div class="dashboard-feed-header">
            <h2>Recent activity</h2>
            <a class="github-button primary" href="/new">${plusIcon}<span>New repository</span></a>
          </div>
          <div class="dashboard-feed">
            ${feedCards}
          </div>
        </section>
      </section>
    </main>
${authPopupScript}
  </body>
</html>`;
};

export const renderRepoListPage = (repos: RepoListItem[], viewer?: WebViewer): string => {
  const repoCards = renderRepoCards(repos, "No repositories have been created yet.");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Octopus Repositories</title>
${faviconLinks}
    <style>
${pageStyles}
    </style>
  </head>
  <body>
${topNavigation(viewer)}
    <header>
      <div class="bar">
        <div class="repo-header-main">
          <h1>Octopus Repositories</h1>
          <p class="repo-subtitle">Browse recoverable Git repositories backed by Sui and Walrus.</p>
        </div>
        <div class="meta">${repos.length} repos</div>
      </div>
    </header>
    <main>
      <section class="repo-list" aria-label="Repositories">
        ${repoCards}
      </section>
    </main>
${authPopupScript}
  </body>
</html>`;
};

export const renderProfilePage = (owner: string, repos: RepoListItem[], viewer?: WebViewer): string => {
  const escapedOwner = escapeHtml(owner);
  const repoCards = renderPopularRepoCards(repos, `${owner} does not have visible repositories yet.`);
  const contributionCalendar = renderContributionCalendar(repos);
  const contributionActivity = renderContributionActivity(repos);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapedOwner} - Octopus</title>
${faviconLinks}
    <style>
${pageStyles}
    </style>
  </head>
  <body>
${topNavigation(viewer)}
    <main>
      <section class="profile-layout" aria-label="${escapeAttr(owner)} profile">
        <aside class="profile-sidebar">
          <img class="profile-avatar" src="/android-chrome-192x192.png" alt="" width="240" height="240">
          <div>
            <h1 class="profile-name">${escapedOwner}</h1>
            <p class="profile-handle">${escapedOwner}</p>
          </div>
          <ul class="profile-stats">
            <li><strong>${repos.length}</strong> repositories</li>
          </ul>
        </aside>
        <div class="profile-main" id="repositories">
          <h2 class="profile-main-heading">Popular repositories</h2>
          ${repoCards}
          ${contributionCalendar}
          ${contributionActivity}
        </div>
      </section>
    </main>
${authPopupScript}
  </body>
</html>`;
};

export const renderPrivateRepoLoginPage = (input: {
  repo: RepoListItem;
  viewer?: WebViewer;
  loginHref: string;
  message: string;
}): string => {
  const repo = input.repo;
  const repoId = escapeHtml(repo.repoId);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Private repository · ${repoId} - Octopus</title>
${faviconLinks}
    <style>
${pageStyles}
    </style>
  </head>
  <body>
${topNavigation(input.viewer)}
    ${repoHeader(repo, "Private repository")}
    <main>
      <section class="private-gate" aria-label="Private repository access">
        <h2>Private repository</h2>
        <p>${escapeHtml(input.message)}</p>
        <div class="private-gate-actions">
          <a class="github-button primary" href="${escapeAttr(input.loginHref)}">Sign in with Sui wallet</a>
        </div>
      </section>
    </main>
${authPopupScript}
  </body>
</html>`;
};

export const renderPrivateRepoUnlockPage = (input: {
  repo: RepoListItem;
  viewer: WebViewer;
  unlockHref: string;
  message: string;
}): string => {
  const repo = input.repo;
  const repoId = escapeHtml(repo.repoId);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Unlock repository · ${repoId} - Octopus</title>
${faviconLinks}
    <style>
${pageStyles}
    </style>
  </head>
  <body>
${topNavigation(input.viewer)}
    ${repoHeader(repo, "Private repository")}
    <main>
      <section class="private-gate" aria-label="Private repository unlock">
        <h2>Unlock repository</h2>
        <p>${escapeHtml(input.message)}</p>
        <div class="private-gate-actions">
          <a class="github-button primary" href="${escapeAttr(input.unlockHref)}" data-octopus-auth-popup>Unlock repository</a>
        </div>
      </section>
    </main>
${authPopupScript}
  </body>
</html>`;
};

const initials = (value: string): string => {
  const letters = value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
  return letters ? letters.toUpperCase() : "OC";
};

const commitTimestamp = (commit: IndexedCommit): string => {
  return commit.committedAt || commit.authoredAt;
};

const renderTreeRows = (
  repo: RepoListItem,
  ref: string,
  entries: TreeEntry[],
  latestCommit: IndexedCommit | undefined
): string => {
  if (entries.length === 0) {
    return `<tr><td colspan="3" class="empty">No files in this tree.</td></tr>`;
  }

  const commitSubject = latestCommit?.subject ?? "No commits indexed yet";
  const commitTime = latestCommit ? formatRelativeDate(commitTimestamp(latestCommit)) : "";

  return entries
    .map((entry) => {
      const displayName = entry.type === "tree" ? `${escapeHtml(entry.name)}/` : escapeHtml(entry.name);
      const href =
        entry.type === "tree"
          ? `/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/tree?ref=${encodeURIComponent(ref)}&path=${encodeURIComponent(entry.path)}`
          : `/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/blob?ref=${encodeURIComponent(ref)}&path=${encodeURIComponent(entry.path)}`;

      return `<tr class="file-browser-row">
        <td class="file-name-cell">
          <a class="entry-link" href="${href}" title="${escapeAttr(entry.path)}">
            ${treeEntryIcon(entry)}
            <span class="entry-name">${displayName}</span>
          </a>
        </td>
        <td class="file-message-cell"><span class="commit-message" title="${escapeAttr(commitSubject)}">${escapeHtml(commitSubject)}</span></td>
        <td class="file-time-cell"><span title="${escapeAttr(latestCommit ? commitTimestamp(latestCommit) : "")}">${escapeHtml(commitTime)}</span></td>
      </tr>`;
    })
    .join("");
};

const renderFileBrowserHeader = (
  repo: RepoListItem,
  ref: string,
  commits: IndexedCommit[],
  commitCount: number,
  commitActors?: CommitActorMap
): string => {
  const latestCommit = commits[0];
  const commitsHref = `/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/commits?ref=${encodeURIComponent(ref)}`;

  if (!latestCommit) {
    return `<tr class="file-browser-summary-row">
      <td colspan="3" class="file-browser-summary-cell">
        <div class="file-browser-summary">
          <div class="commit-lead"><span class="avatar">OC</span><strong class="commit-author">Octopus</strong><a class="commit-message" href="${commitsHref}">No commits indexed yet</a></div>
          <div class="commit-meta"><a class="commit-count" href="${commitsHref}">${commitCount} commits</a></div>
        </div>
      </td>
    </tr>`;
  }

  const actor = commitActorDisplay(repo, latestCommit, commitActors);
  const actorDate = commitTimestamp(latestCommit);
  const relativeDate = formatRelativeDate(actorDate);
  return `<tr class="file-browser-summary-row">
    <td colspan="3" class="file-browser-summary-cell">
      <div class="file-browser-summary">
        <div class="commit-lead">
          <span class="avatar">${escapeHtml(initials(actor.label))}</span>
          <strong class="commit-author" title="${escapeAttr(actor.title)}">${escapeHtml(actor.label)}</strong>
          <a class="commit-message" href="${commitsHref}" title="${escapeAttr(latestCommit.subject)}">${escapeHtml(latestCommit.subject)}</a>
        </div>
        <div class="commit-meta">
          <a href="${commitsHref}"><code>${escapeHtml(latestCommit.oid.slice(0, 7))}</code></a>
          <span title="${escapeAttr(actorDate)}">${escapeHtml(relativeDate)}</span>
          <a class="commit-count" href="${commitsHref}">${commitCount} commits</a>
        </div>
      </div>
    </td>
  </tr>`;
};

const renderCommitSummary = (commits: IndexedCommit[]): string => {
  if (commits.length === 0) {
    return `<p class="summary-copy">No commits indexed yet.</p>`;
  }

  const items = commits
    .slice(0, 3)
    .map(
      (commit) => `<li>
      <strong title="${escapeAttr(commit.subject)}">${escapeHtml(commit.subject)}</strong>
      <span><code>${escapeHtml(commit.oid.slice(0, 8))}</code> ${escapeHtml(commit.authoredAt)}</span>
    </li>`
    )
    .join("");

  return `<ul class="summary-list">${items}</ul>`;
};

const breadcrumbs = (repo: RepoListItem, ref: string, path: string): string => {
  if (!path) {
    return "";
  }

  const parts = path ? path.split("/") : [];
  const links = [
    `<a href="/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/tree?ref=${encodeURIComponent(ref)}">root</a>`
  ];
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    links.push(
      `<a href="/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/tree?ref=${encodeURIComponent(ref)}&path=${encodeURIComponent(current)}">${escapeHtml(part)}</a>`
    );
  }
  return links.join(" / ");
};

const safeMarkdownHref = (href: string): string | null => {
  const trimmed = href.trim();
  if (!trimmed || trimmed.includes("\0")) {
    return null;
  }

  if (/^(https?:\/\/|\/|#)/i.test(trimmed)) {
    return trimmed;
  }

  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed)) {
    return null;
  }

  return trimmed;
};

const renderInlineMarkdown = (value: string): string => {
  const pattern = /(`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let cursor = 0;
  let output = "";
  for (const match of value.matchAll(pattern)) {
    output += escapeHtml(value.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith("`")) {
      output += `<code>${escapeHtml(token.slice(1, -1))}</code>`;
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = link ? safeMarkdownHref(link[2] ?? "") : null;
      output += href
        ? `<a href="${escapeAttr(href)}">${escapeHtml(link?.[1] ?? "")}</a>`
        : escapeHtml(link?.[1] ?? token);
    }
    cursor = (match.index ?? 0) + token.length;
  }

  output += escapeHtml(value.slice(cursor));
  return output;
};

const renderReadmeMarkdown = (content: string): string => {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let list: "ul" | "ol" | null = null;
  let codeFence = false;
  let codeLines: string[] = [];

  const closeList = (): void => {
    if (list) {
      html.push(`</${list}>`);
      list = null;
    }
  };

  const openList = (type: "ul" | "ol"): void => {
    if (list === type) {
      return;
    }
    closeList();
    list = type;
    html.push(`<${type}>`);
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    if (line.startsWith("```")) {
      if (codeFence) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        codeFence = false;
      } else {
        closeList();
        codeFence = true;
      }
      continue;
    }

    if (codeFence) {
      codeLines.push(rawLine);
      continue;
    }

    if (!line.trim()) {
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = Math.min(heading[1]?.length ?? 1, 6);
      html.push(`<h${level}>${renderInlineMarkdown(heading[2] ?? "")}</h${level}>`);
      continue;
    }

    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    if (unordered) {
      openList("ul");
      html.push(`<li>${renderInlineMarkdown(unordered[1] ?? "")}</li>`);
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ordered) {
      openList("ol");
      html.push(`<li>${renderInlineMarkdown(ordered[1] ?? "")}</li>`);
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeList();
      html.push(`<blockquote><p>${renderInlineMarkdown(quote[1] ?? "")}</p></blockquote>`);
      continue;
    }

    closeList();
    html.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }

  if (codeFence) {
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  closeList();
  return html.join("\n");
};

const renderRepoAboutPanel = (input: { repo: RepoListItem }): string => {
  return `<aside class="repo-about" aria-label="Repository about">
      <h2>About</h2>
      <p class="repo-about-copy">No description, website, or topics provided.</p>
    </aside>`;
};

const renderReadmePanel = (readme: BlobView | null | undefined): string => {
  if (!readme) {
    return "";
  }

  const body =
    readme.encoding === "utf8"
      ? renderReadmeMarkdown(readme.content)
      : `<p class="notice">README preview is only available for UTF-8 text.</p>`;

  return `<section class="readme-panel" aria-label="README preview">
      <div class="readme-panel-header">
        <div class="readme-panel-title">${readmeIcon}<span>${escapeHtml(readme.path)}</span></div>
      </div>
      <div class="readme-body">
        ${readme.truncated ? `<p class="notice">Preview is truncated at the configured blob view limit.</p>` : ""}
        ${body}
      </div>
    </section>`;
};

const repoActivityKindLabel = (kind: RepoActivityItem["kind"]): string => {
  switch (kind) {
    case "access":
      return "A";
    case "pull_request":
      return "PR";
    case "push":
      return "P";
    case "repo":
      return "R";
  }
};

const shortProofValue = (value: string): string => {
  if (/^0x[0-9a-fA-F]+$/.test(value)) {
    return shortWallet(value);
  }
  return value.length > 36 ? `${value.slice(0, 18)}...${value.slice(-10)}` : value;
};

const renderRepoActivityProof = (proofItems: RepoActivityProof[]): string => {
  if (proofItems.length === 0) {
    return "";
  }

  return `<details class="repo-activity-proof">
      <summary>Proof</summary>
      <div class="repo-activity-proof-grid">
        ${proofItems
          .map((item) => {
            const value = item.href
              ? `<a class="proof-value" href="${escapeAttr(item.href)}" target="_blank" rel="noreferrer" title="${escapeAttr(item.value)}">${escapeHtml(shortProofValue(item.value))}</a>`
              : `<span class="proof-value" title="${escapeAttr(item.value)}">${escapeHtml(shortProofValue(item.value))}</span>`;
            return `<span class="proof-pill">
            <span class="proof-label">${escapeHtml(item.label)}</span>
            ${value}
          </span>`;
          })
          .join("")}
      </div>
    </details>`;
};

const renderRepoActivityItem = (repo: RepoListItem, item: RepoActivityItem): string => {
  const actor = actorDisplayForWallet(repo, item.actorWalletAddress);
  const title = item.href ? `<a href="${escapeAttr(item.href)}">${escapeHtml(item.title)}</a>` : escapeHtml(item.title);
  const actorText = actor ? `<span title="${escapeAttr(actor.title)}">${escapeHtml(actor.label)}</span>` : "";

  return `<article class="repo-activity-item">
      <span class="repo-activity-kind" aria-hidden="true">${escapeHtml(repoActivityKindLabel(item.kind))}</span>
      <div class="repo-activity-main">
        <div class="repo-activity-title">${title}</div>
        <p class="repo-activity-description" title="${escapeAttr(item.description)}">${escapeHtml(item.description)}</p>
        <div class="repo-activity-meta">
          ${actorText}
          <span title="${escapeAttr(formatDate(item.createdAtMs))}">${escapeHtml(formatRelativeDate(item.createdAtMs))}</span>
        </div>
        ${renderRepoActivityProof(item.proof)}
      </div>
    </article>`;
};

export const renderRepoActivityPage = (input: {
  repo: RepoListItem;
  activity: RepoActivityItem[];
  viewer?: WebViewer;
}): string => {
  const repo = input.repo;
  const rows =
    input.activity.length === 0
      ? `<div class="empty">No repository activity yet.</div>`
      : `<div class="repo-activity-list">${input.activity.map((item) => renderRepoActivityItem(repo, item)).join("")}</div>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Activity · ${escapeHtml(repo.repoId)} - Octopus</title>
${faviconLinks}
    <style>
${pageStyles}
    </style>
  </head>
  <body>
${topNavigation(input.viewer)}
    ${repoHeader(repo, "Repository activity", "activity", input.viewer)}
    <main class="stack">
      <section class="panel repo-activity-panel">
        <div class="repo-activity-header">
          <div>
            <h2>Activity</h2>
            <p>Human-readable repository actions with wallet and storage proof when available.</p>
          </div>
        </div>
        ${rows}
      </section>
    </main>
${authPopupScript}
  </body>
</html>`;
};

export const renderRepoAccessPage = (input: { repo: RepoListItem; viewer?: WebViewer }): string => {
  const repo = input.repo;
  const returnTo = repoAccessHref(repo);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Manage access · ${escapeHtml(repo.repoId)} - Octopus</title>
${faviconLinks}
    <style>
${pageStyles}
    </style>
  </head>
  <body>
${topNavigation(input.viewer)}
    ${repoHeader(repo, "Manage repository access", "settings", input.viewer)}
    <main class="stack">
      <section class="panel access-page-panel">
        ${renderRepoAccessPanel(repo, input.viewer, returnTo)}
      </section>
    </main>
${authPopupScript}
  </body>
</html>`;
};

const renderPullRequestFilter = (
  repo: RepoListItem,
  allPullRequests: PullRequest[],
  active: PullRequestStatusFilter
): string => {
  const counts = {
    open: allPullRequests.filter((pullRequest) => pullRequest.status === "open").length,
    closed: allPullRequests.filter((pullRequest) => pullRequest.status === "closed").length,
    merged: allPullRequests.filter((pullRequest) => pullRequest.status === "merged").length,
    all: allPullRequests.length
  };

  return `<nav class="pull-request-filter" aria-label="Filter pull requests">
      ${(["open", "closed", "merged", "all"] as const)
        .map((status) => {
          const href = `${pullRequestAction(repo)}?status=${status}`;
          const className = status === active ? ` class="active"` : "";
          return `<a${className} href="${escapeAttr(href)}">${escapeHtml(`${counts[status]} ${status}`)}</a>`;
        })
        .join("")}
    </nav>`;
};

export const renderPullRequestListPage = (input: {
  repo: RepoListItem;
  pullRequests: PullRequest[];
  allPullRequests?: PullRequest[];
  status?: PullRequestStatusFilter;
  viewer?: WebViewer;
}): string => {
  const repo = input.repo;
  const rows = renderPullRequestRows(repo, input.pullRequests);
  const createButton = renderNewPullRequestButton(repo, input.viewer);
  const filter = renderPullRequestFilter(repo, input.allPullRequests ?? input.pullRequests, input.status ?? "all");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pull requests · ${escapeHtml(repo.repoId)} - Octopus</title>
${faviconLinks}
    <style>
${pageStyles}
    </style>
  </head>
  <body>
${topNavigation(input.viewer)}
    ${repoHeader(repo, "Pull requests", "pulls", input.viewer)}
    <main class="stack">
      <section class="toolbar">
        <div class="toolbar-group">
          ${filter}
        </div>
        ${createButton}
      </section>
      <section class="table-wrap">
        <table class="compact">
          <thead>
            <tr>
              <th>Status</th>
              <th>Title</th>
              <th>Author</th>
              <th>Head</th>
              <th style="text-align:right">Updated</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </section>
    </main>
${authPopupScript}
  </body>
</html>`;
};

export const renderPullRequestCreatePage = (input: { repo: RepoListItem; viewer?: WebViewer }): string => {
  const repo = input.repo;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Open pull request · ${escapeHtml(repo.repoId)} - Octopus</title>
${faviconLinks}
    <style>
${pageStyles}
    </style>
  </head>
  <body>
${topNavigation(input.viewer)}
    ${repoHeader(repo, "Open pull request", "pulls", input.viewer)}
    <main class="stack">
      ${renderPullRequestCreatePanel(repo, input.viewer)}
    </main>
${authPopupScript}
  </body>
</html>`;
};

const isPullRequestAuthor = (pullRequest: PullRequest, viewer?: WebViewer): boolean => {
  return Boolean(viewer && viewer.walletAddress.toLowerCase() === pullRequest.authorWalletAddress.toLowerCase());
};

const renderPullRequestActionsPanel = (
  repo: RepoListItem,
  pullRequest: PullRequest,
  comparison: PullRequestComparison,
  mergeability: PullRequestMergeability | undefined,
  viewer?: WebViewer,
  errorMessage?: string
): string => {
  const canMerge = canWritePullRequests(repo, viewer);
  const canTransition = canMerge || isPullRequestAuthor(pullRequest, viewer);
  const actionBase = pullRequestHref(repo, pullRequest);
  const errorNotice = errorMessage ? `<p class="notice">${escapeHtml(errorMessage)}</p>` : "";

  const sections: string[] = [];
  if (pullRequest.status === "merged") {
    const strategy = pullRequest.mergeStrategy ? ` (${pullRequest.mergeStrategy})` : "";
    const mergeCommit = pullRequest.mergeCommit
      ? ` as <code title="${escapeAttr(pullRequest.mergeCommit)}">${escapeHtml(pullRequest.mergeCommit.slice(0, 8))}</code>`
      : "";
    sections.push(`<p class="summary-copy">Merged${escapeHtml(strategy)}${mergeCommit}.</p>`);
  } else if (pullRequest.status === "open" && mergeability) {
    sections.push(
      mergeability.mergeable
        ? `<p class="summary-copy">No conflicts with the base branch.</p>`
        : `<p class="notice">${escapeHtml(mergeability.reason ?? "This pull request cannot be merged.")}</p>`
    );
  }

  if (pullRequest.status === "open" && canMerge && mergeability?.mergeable) {
    sections.push(`<form class="pull-request-merge-form" method="post" action="${escapeAttr(`${actionBase}/merge`)}">
        <input type="hidden" name="expectedHeadCommit" value="${escapeAttr(comparison.headCommit)}">
        <select class="pull-request-select" name="strategy" aria-label="Merge strategy">
          <option value="merge">Create a merge commit</option>
          <option value="squash">Squash and merge</option>
          <option value="fast-forward">Fast-forward</option>
        </select>
        <label><input type="checkbox" name="deleteBranch" value="true"> Delete head branch</label>
        <button class="github-button primary" type="submit">Merge pull request</button>
      </form>`);
  }

  if (pullRequest.status === "open" && canTransition) {
    sections.push(`<form method="post" action="${escapeAttr(`${actionBase}/close`)}">
        <button class="github-button" type="submit">Close pull request</button>
      </form>`);
  }

  if (pullRequest.status === "closed" && canTransition) {
    sections.push(`<form method="post" action="${escapeAttr(`${actionBase}/reopen`)}">
        <button class="github-button" type="submit">Reopen pull request</button>
      </form>`);
  }

  if (!errorNotice && sections.length === 0) {
    return "";
  }

  return `<section class="panel">
      ${errorNotice}
      <div class="pull-request-actions">${sections.join("")}</div>
    </section>`;
};

const renderPullRequestComments = (repo: RepoListItem, pullRequest: PullRequest, viewer?: WebViewer): string => {
  const comments = [...pullRequest.comments].sort((a, b) => a.createdAtMs - b.createdAtMs || a.id - b.id);
  const thread =
    comments.length === 0
      ? `<p class="summary-copy">No comments yet.</p>`
      : `<div class="comment-thread">${comments
          .map((comment) => {
            const author = actorDisplayForWallet(repo, comment.authorWalletAddress) ?? {
              label: shortWallet(comment.authorWalletAddress),
              title: comment.authorWalletAddress
            };
            return `<article class="comment-item">
              <div class="comment-meta">
                <span title="${escapeAttr(author.title)}">${escapeHtml(author.label)}</span>
                <span title="${escapeAttr(formatDate(comment.createdAtMs))}">${escapeHtml(formatRelativeDate(comment.createdAtMs))}</span>
              </div>
              <p class="comment-body">${escapeHtml(comment.body)}</p>
            </article>`;
          })
          .join("")}</div>`;

  const canComment = canWritePullRequests(repo, viewer) || isPullRequestAuthor(pullRequest, viewer);
  const form = canComment
    ? `<form class="comment-form" method="post" action="${escapeAttr(`${pullRequestHref(repo, pullRequest)}/comments`)}">
        <textarea class="pull-request-textarea" name="body" maxlength="10000" placeholder="Leave a comment" required></textarea>
        <div><button class="github-button primary" type="submit">Comment</button></div>
      </form>`
    : "";

  return `<section class="panel">
      <h2>${escapeHtml(pluralize(comments.length, "comment"))}</h2>
      ${thread}
      ${form}
    </section>`;
};

export const renderPullRequestPage = (input: {
  repo: RepoListItem;
  pullRequest: PullRequest;
  comparison: PullRequestComparison;
  mergeability?: PullRequestMergeability;
  commitActors?: CommitActorMap;
  viewer?: WebViewer;
  errorMessage?: string;
}): string => {
  const repo = input.repo;
  const pullRequest = input.pullRequest;
  const comparison = input.comparison;
  const body = pullRequest.body
    ? `<p class="pull-request-body">${escapeHtml(pullRequest.body)}</p>`
    : `<p class="summary-copy">No description provided.</p>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>#${pullRequest.number} ${escapeHtml(pullRequest.title)} - ${escapeHtml(repo.repoId)}</title>
${faviconLinks}
    <style>
${pageStyles}
    </style>
  </head>
  <body>
${topNavigation(input.viewer)}
    ${repoHeader(repo, `Pull request #${pullRequest.number}`, "pulls", input.viewer)}
    <main class="stack">
      <section class="panel">
        <div class="toolbar">
          <div>
            <h2>${escapeHtml(pullRequest.title)}</h2>
            <div class="pull-request-branches">${escapeHtml(shortRef(pullRequest.headRef))} into ${escapeHtml(shortRef(pullRequest.baseRef))}</div>
          </div>
          ${pullRequestStatusBadge(pullRequest.status)}
        </div>
        ${body}
      </section>
      ${renderPullRequestActionsPanel(repo, pullRequest, comparison, input.mergeability, input.viewer, input.errorMessage)}
      <section class="toolbar pull-request-summary">
        <div class="toolbar-group">
          <span class="repo-stat">${escapeHtml(pluralize(comparison.commitCount, "commit"))}</span>
          <span class="repo-stat">${escapeHtml(pluralize(comparison.fileCount, "file"))}</span>
          <span class="diff-stat"><span class="diff-additions">+${comparison.additions}</span> <span class="diff-deletions">-${comparison.deletions}</span></span>
        </div>
        <div class="pull-request-compare" aria-label="Pull request comparison">
          <span class="compare-ref"><span class="compare-ref-label">base</span><span class="compare-ref-name">${escapeHtml(shortRef(pullRequest.baseRef))}</span></span>
          <span aria-hidden="true">←</span>
          <span class="compare-ref"><span class="compare-ref-label">compare</span><span class="compare-ref-name">${escapeHtml(shortRef(pullRequest.headRef))}</span></span>
        </div>
      </section>
      <section class="table-wrap">
        <table class="compact">
          <thead>
            <tr>
              <th>SHA</th>
              <th>Message</th>
              <th>Author</th>
              <th style="text-align:right">Authored</th>
            </tr>
          </thead>
          <tbody>
            ${renderPullRequestCommitRows(repo, comparison.commits, input.commitActors)}
          </tbody>
        </table>
      </section>
      <section class="table-wrap">
        <table class="compact">
          <thead>
            <tr>
              <th>File</th>
              <th>Additions</th>
              <th>Deletions</th>
            </tr>
          </thead>
          <tbody>
            ${renderPullRequestFileRows(comparison)}
          </tbody>
        </table>
      </section>
      ${renderPullRequestComments(repo, pullRequest, input.viewer)}
    </main>
${authPopupScript}
  </body>
</html>`;
};

const renderRepositorySetupGuide = (remoteUrl: string): string => {
  return `<section class="repo-setup-guide">
    <div class="setup-section">
      <h2 class="setup-heading">Create a new repository on the command line</h2>
      <div class="setup-commands">
<pre><code>git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin ${escapeHtml(remoteUrl)}
git push -u origin main</code></pre>
        <button class="clone-copy-button" type="button" title="Copy commands" aria-label="Copy commands" data-copy-text="${escapeAttr(`git init\ngit add .\ngit commit -m "first commit"\ngit branch -M main\ngit remote add origin ${remoteUrl}\ngit push -u origin main`)}">${copyIcon}</button>
      </div>
    </div>
    <div class="setup-section">
      <h2 class="setup-heading">Push an existing repository from the command line</h2>
      <div class="setup-commands">
<pre><code>git remote add origin ${escapeHtml(remoteUrl)}
git branch -M main
git push -u origin main</code></pre>
        <button class="clone-copy-button" type="button" title="Copy commands" aria-label="Copy commands" data-copy-text="${escapeAttr(`git remote add origin ${remoteUrl}\ngit branch -M main\ngit push -u origin main`)}">${copyIcon}</button>
      </div>
    </div>
  </section>`;
};

export const renderRepoPage = (input: {
  repo: RepoListItem;
  index: RepoIndex;
  commits: IndexedCommit[];
  tree: TreeEntry[];
  readme?: BlobView | null;
  ref: string;
  path: string;
  commitActors?: CommitActorMap;
  origin?: string;
  viewer?: WebViewer;
}): string => {
  const repo = input.repo;
  const repoId = escapeHtml(repo.repoId);
  const latestCommit = input.commits[0];
  const visibleCommitCount = commitCountForRef(input.index, input.ref, input.commits);
  const breadcrumbTrail = breadcrumbs(repo, input.ref, input.path);
  const treeRows = renderTreeRows(repo, input.ref, input.tree, latestCommit);
  const fileBrowserHeader = renderFileBrowserHeader(
    repo,
    input.ref,
    input.commits,
    visibleCommitCount,
    input.commitActors
  );
  const remoteUrl = joinOriginPath(input.origin, repo.gitRemotePath);
  const cloneCommand = `git clone ${remoteUrl}`;
  const indexNotice = input.index.treeTruncated
    ? `<p class="notice">File index is truncated at ${input.index.treeEntryCount} entries. Increase OCTOPUS_INDEX_TREE_LIMIT for larger repositories.</p>`
    : "";
  const aboutPanel = renderRepoAboutPanel({
    repo
  });
  const readmePanel = renderReadmePanel(input.readme);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${repoId} - Octopus</title>
${faviconLinks}
    <style>
${pageStyles}
    </style>
  </head>
  <body>
${topNavigation(input.viewer)}
    ${repoHeader(repo, `Repository ${repoId} on ${shortRef(input.ref)}`, "code", input.viewer)}
    <main>
      <section class="repo-content-layout">
        <div class="repo-primary">
          <section class="toolbar">
            <div class="toolbar-group">
              ${renderBranchSelector(repo, input.ref, { view: "tree", path: input.path })}
              <span class="repo-stat">${escapeHtml(pluralize(repo.refCount, "branch", "branches"))}</span>
              ${breadcrumbTrail ? `<div class="crumbs">${breadcrumbTrail}</div>` : ""}
            </div>
            <div class="toolbar-group">
              <details class="code-dropdown">
                <summary class="code-trigger">${codeIcon}<span>Code</span></summary>
                <section class="summary-panel" id="repo-details">
                  <div class="summary-tabs" aria-label="Clone location">
                    <span class="summary-tab is-active">Local</span>
                  </div>
                  <div class="clone-panel">
                    <h2 class="clone-heading">Clone</h2>
                    <div class="clone-tabs">
                      <span class="clone-tab is-active">HTTPS</span>
                    </div>
                    <div class="clone-command">
                      <span class="clone-label">Command</span>
                      <div class="clone-url-row">
                        <span class="clone-url" title="${escapeAttr(cloneCommand)}">${escapeHtml(cloneCommand)}</span>
                        <button class="clone-copy-button" type="button" title="Copy clone command" aria-label="Copy clone command" data-copy-text="${escapeAttr(cloneCommand)}">${copyIcon}</button>
                      </div>
                    </div>
                    <p class="clone-description">Run this command in your terminal.</p>
                  </div>
                </section>
              </details>
            </div>
            ${indexNotice}
          </section>
          ${
            input.commits.length === 0 && input.path === ""
              ? renderRepositorySetupGuide(remoteUrl)
              : `<section class="table-wrap">
            <table class="compact file-table file-browser-table">
              <colgroup>
                <col style="width: 40%">
                <col>
                <col style="width: 170px">
              </colgroup>
              <tbody>
                ${fileBrowserHeader}
                ${treeRows}
              </tbody>
            </table>
          </section>`
          }
          ${readmePanel}
        </div>
        ${aboutPanel}
      </section>
    </main>
${authPopupScript}
  </body>
</html>`;
};

export const renderCommitsPage = (input: {
  repo: RepoListItem;
  index: RepoIndex;
  commits: IndexedCommit[];
  ref: string;
  commitActors?: CommitActorMap;
  viewer?: WebViewer;
}): string => {
  const repo = input.repo;
  const repoId = escapeHtml(repo.repoId);
  const visibleCommitCount = commitCountForRef(input.index, input.ref, input.commits);

  const rows =
    input.commits.length === 0
      ? `<tr><td colspan="4" class="empty">No commits indexed yet.</td></tr>`
      : input.commits
          .map((commit) => {
            const authoredRelative = formatRelativeDate(commit.authoredAt);
            const refs = commit.refs?.length
              ? `<div class="commit-meta">${commit.refs
                  .slice(0, 6)
                  .map((ref) => `<span class="badge">${escapeHtml(shortRef(ref))}</span>`)
                  .join(" ")}</div>`
              : "";
            const mergeBadge = commit.parents.length > 1 ? `<span class="badge">merge</span>` : "";

            const actor = commitActorDisplay(repo, commit, input.commitActors);

            return `<tr>
              <td><code title="${escapeAttr(commit.oid)}">${escapeHtml(commit.oid.slice(0, 8))}</code></td>
              <td>
                <div class="commit-message" title="${escapeAttr(commit.subject)}">${escapeHtml(commit.subject)}</div>
                ${refs}
              </td>
              <td title="${escapeAttr(actor.title)}">${escapeHtml(actor.label)} ${mergeBadge}</td>
              <td class="file-time-cell" title="${escapeAttr(commit.authoredAt)}">${escapeHtml(authoredRelative)}</td>
            </tr>`;
          })
          .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Commits · ${repoId} - Octopus</title>
${faviconLinks}
    <style>
${pageStyles}
    </style>
  </head>
  <body>
${topNavigation(input.viewer)}
    ${repoHeader(repo, `Commits on ${shortRef(input.ref)}`, "commits", input.viewer)}
    <main class="stack">
      <section class="toolbar">
        <div class="toolbar-group">
          ${renderBranchSelector(repo, input.ref, { view: "commits" })}
          <span class="repo-stat">${escapeHtml(pluralize(visibleCommitCount, "commit"))}</span>
        </div>
        <div class="toolbar-group">
          <span class="soft-chip">Last indexed ${escapeHtml(formatRelativeDate(input.index.indexedAtMs))}</span>
        </div>
      </section>
      <section class="table-wrap">
        <table class="compact">
          <thead>
            <tr>
              <th>SHA</th>
              <th>Message</th>
              <th>Author</th>
              <th style="text-align:right">Authored</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </section>
    </main>
${authPopupScript}
  </body>
</html>`;
};

export const renderBlobPage = (input: {
  repo: RepoListItem;
  index: RepoIndex;
  commits: IndexedCommit[];
  ref: string;
  file: BlobView;
  viewer?: WebViewer;
}): string => {
  const repo = input.repo;
  const file = input.file;
  const visibleCommitCount = commitCountForRef(input.index, input.ref, input.commits);
  const breadcrumbTrail = breadcrumbs(repo, input.ref, file.path);
  const commitSummary = renderCommitSummary(input.commits);
  const fileBody =
    file.encoding === "utf8"
      ? `<pre>${escapeHtml(file.content)}</pre>`
      : `<p class="notice">Binary file preview is base64 encoded.</p><pre>${escapeHtml(file.content)}</pre>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(file.path)} - ${escapeHtml(repo.repoId)}</title>
${faviconLinks}
    <style>
${pageStyles}
    </style>
  </head>
  <body>
${topNavigation(input.viewer)}
    ${repoHeader(repo, file.path, "code", input.viewer)}
    <main class="stack">
      <section class="toolbar">
        <div class="toolbar-group">
          ${renderBranchSelector(repo, input.ref, { view: "blob", path: file.path })}
          ${breadcrumbTrail ? `<div class="crumbs">${breadcrumbTrail}</div>` : ""}
        </div>
        <div class="toolbar-group">
          <span class="soft-chip">${escapeHtml(file.encoding)}</span>
          <span class="soft-chip">${file.size} bytes</span>
          <details class="info-dropdown">
            <summary class="info-trigger">Info</summary>
            <section class="summary-panel" id="file-details">
              <div class="summary-tabs" aria-label="File details">
                <span class="summary-tab is-active">File info</span>
                <span class="summary-tab">Recent commit</span>
                <span class="summary-tab">Index</span>
              </div>
              <div class="summary-grid">
                <div class="summary-item summary-wide">
                  <span class="summary-label">Path</span>
                  <strong class="summary-value" title="${escapeAttr(file.path)}">${escapeHtml(file.path)}</strong>
                </div>
                <div class="summary-item">
                  <span class="summary-label">Object</span>
                  <strong class="summary-value"><code>${escapeHtml(file.objectId.slice(0, 8))}</code></strong>
                </div>
                <div class="summary-item">
                  <span class="summary-label">Size</span>
                  <strong class="summary-value">${file.size} bytes</strong>
                </div>
                <div class="summary-item">
                  <span class="summary-label">Encoding</span>
                  <strong class="summary-value">${escapeHtml(file.encoding)}</strong>
                </div>
                <div class="summary-item">
                  <span class="summary-label">Branch</span>
                  <strong class="summary-value">${escapeHtml(shortRef(input.ref))}</strong>
                </div>
                <div class="summary-item summary-wide">
                  <span class="summary-label">Recent commit</span>
                  ${commitSummary}
                </div>
                <div class="summary-item summary-wide">
                  <span class="summary-label">Last indexed</span>
                  <strong class="summary-value" title="${escapeAttr(formatDate(input.index.indexedAtMs))}">${escapeHtml(formatDate(input.index.indexedAtMs))}</strong>
                </div>
              </div>
            </section>
          </details>
        </div>
      </section>
      <section class="panel">
        ${file.truncated ? `<p class="notice">Preview is truncated at the configured blob view limit.</p>` : ""}
        ${fileBody}
      </section>
    </main>
${authPopupScript}
  </body>
</html>`;
};
