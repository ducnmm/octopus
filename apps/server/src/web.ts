import type { SuiRepoState } from "./sui.js";
import type { BlobView, IndexedCommit, RepoIndex, TreeEntry } from "./indexer.js";

export type RepoRefListItem = {
  name: string;
  shortName: string;
  commitDigest: string;
  updatedAtMs: number;
  isDefault: boolean;
};

export type RepoListItem = {
  owner: string;
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
  commitCount?: number;
  commitDates?: string[];
  createdAtMs: number;
  updatedAtMs: number;
};

export type WebViewer = {
  walletAddress: string;
} | null;

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
    createdAtMs: state.createdAtMs,
    updatedAtMs: state.updatedAtMs
  };
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
      case "\"":
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
  return new Date(value).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
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
      ? monthNames[Number(monthStart.key.slice(5, 7)) - 1] ?? ""
      : weeks.length === 0 && firstInRange && Number(firstInRange.key.slice(8, 10)) <= 7
        ? monthNames[Number(firstInRange.key.slice(5, 7)) - 1] ?? ""
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

const pageStyles = `
      :root {
        color-scheme: light dark;
        --github-header: #24292f;
        --fg-default: #1f2328;
        --fg-muted: #656d76;
        --fg-subtle: #6e7781;
        --canvas-default: #ffffff;
        --canvas-muted: #f6f8fa;
        --canvas-subtle: #f6f8fa;
        --border-default: #d0d7de;
        --border-muted: #d8dee4;
        --accent-fg: #7c3aed;
        --success-fg: #7c3aed;
        --danger-fg: #cf222e;
        --attention-fg: #9a6700;
        --button-hover: #f3f4f6;
        --brand-bg: #7c3aed;
        --brand-hover: #6d28d9;
        --brand-border: rgba(124, 58, 237, 0.42);
        --active-border: #7c3aed;
        --notice-border: #d4a72c66;
        --notice-bg: #fff8c5;
        --folder-fg: #7c3aed;
        --folder-bg: #f5f0ff;
        --avatar-bg: #7c3aed;
        --contribution-empty: #ebedf0;
        --contribution-l1: #ede9fe;
        --contribution-l2: #c4b5fd;
        --contribution-l3: #8b5cf6;
        --contribution-l4: #5b21b6;
        --shadow-small: 0 1px 0 rgba(31, 35, 40, 0.04);
        --shadow-overlay: 0 12px 28px rgba(31, 35, 40, 0.16);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --github-header: #010409;
          --fg-default: #e6edf3;
          --fg-muted: #8b949e;
          --fg-subtle: #7d8590;
          --canvas-default: #0d1117;
          --canvas-muted: #161b22;
          --canvas-subtle: #21262d;
          --border-default: #30363d;
          --border-muted: #21262d;
          --accent-fg: #a371f7;
          --success-fg: #a371f7;
          --danger-fg: #ff7b72;
          --attention-fg: #d29922;
          --button-hover: #21262d;
          --brand-bg: #8957e5;
          --brand-hover: #a371f7;
          --brand-border: rgba(163, 113, 247, 0.45);
          --active-border: #a371f7;
          --notice-border: #bb800966;
          --notice-bg: #2d2100;
          --folder-fg: #a371f7;
          --folder-bg: #251a36;
          --avatar-bg: #8957e5;
          --contribution-empty: #161b22;
          --contribution-l1: #2f1e45;
          --contribution-l2: #56328d;
          --contribution-l3: #8957e5;
          --contribution-l4: #c297ff;
          --shadow-small: 0 0 transparent;
          --shadow-overlay: 0 16px 32px rgba(1, 4, 9, 0.55);
        }
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-width: 320px;
        min-height: 100vh;
        background: var(--canvas-default);
        color: var(--fg-default);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
      }

      .site-topbar {
        background: var(--github-header);
        color: #ffffff;
      }

      .site-topbar-inner {
        display: flex;
        align-items: center;
        min-height: 64px;
        width: min(1280px, calc(100% - 64px));
        margin: 0 auto;
      }

      .site-logo {
        display: block;
        width: 32px;
        height: 32px;
        flex: 0 0 auto;
        object-fit: contain;
      }

      .site-brand {
        display: inline-flex;
        align-items: center;
        gap: 16px;
        color: #ffffff;
        font-size: 14px;
        font-weight: 600;
        line-height: 20px;
        text-decoration: none;
        white-space: nowrap;
      }

      .site-brand:hover {
        color: #c9d1d9;
        text-decoration: none;
      }

      .site-auth {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        margin-left: auto;
      }

      .site-auth-link,
      .site-auth-button,
      .site-wallet {
        display: inline-flex;
        align-items: center;
        min-height: 32px;
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 6px;
        background: transparent;
        color: #ffffff;
        padding: 0 10px;
        font-size: 13px;
        font-weight: 600;
        line-height: 20px;
      }

      .site-auth-link:hover,
      .site-auth-button:hover {
        background: rgba(255, 255, 255, 0.08);
        text-decoration: none;
      }

      .site-auth-button {
        cursor: pointer;
        font: inherit;
      }

      .site-auth-form {
        margin: 0;
      }

      .site-wallet {
        max-width: 168px;
        overflow: hidden;
        color: #c9d1d9;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      header {
        border-bottom: 1px solid var(--border-default);
        background: var(--canvas-muted);
      }

      main,
      .bar {
        width: min(1280px, calc(100% - 64px));
        margin: 0 auto;
      }

      .bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        min-height: 98px;
        padding: 22px 0 12px;
      }

      .repo-header-main {
        display: flex;
        width: 100%;
        min-width: 0;
        flex-direction: column;
        gap: 8px;
      }

      h1 {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 8px;
        margin: 0;
        color: var(--fg-default);
        font-size: 20px;
        font-weight: 600;
        line-height: 1.35;
      }

      h1 a,
      h1 a:visited {
        color: var(--accent-fg);
      }

      .repo-title-path {
        display: inline-flex;
        width: 100%;
        min-width: 0;
        align-items: center;
        gap: 6px;
        overflow: hidden;
      }

      .repo-title-owner {
        display: block;
        flex: 0 0 auto;
        color: var(--fg-muted);
        font-weight: 400;
      }

      .repo-title-name {
        display: block;
        min-width: 0;
        overflow: hidden;
        color: var(--accent-fg);
        font-weight: 600;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .repo-subtitle {
        margin: 0;
        color: var(--fg-muted);
        font-size: 13px;
      }

      h2 {
        margin: 0 0 12px;
        color: var(--fg-default);
        font-size: 16px;
        font-weight: 600;
      }

      a {
        color: var(--accent-fg);
        font-weight: 600;
        text-decoration: none;
      }

      a:hover {
        text-decoration: underline;
      }

      main {
        padding: 24px 0 48px;
      }

      .stack {
        display: grid;
        gap: 16px;
      }

      .meta,
      .branch-chip,
      .branch-trigger,
      .soft-chip,
      .info-trigger,
      .code-trigger {
        display: inline-flex;
        align-items: center;
        min-height: 32px;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--canvas-muted);
        color: var(--fg-default);
        padding: 0 12px;
        font-size: 14px;
        font-weight: 600;
        white-space: nowrap;
      }

      .meta {
        color: var(--fg-muted);
        font-weight: 500;
      }

      .visibility-meta {
        background: transparent;
      }

      .visibility-meta .badge {
        min-height: auto;
        border: 0;
        background: transparent;
        padding: 0;
      }

      .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .toolbar-group {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      .branch-dropdown {
        position: relative;
      }

      .branch-trigger {
        max-width: min(320px, calc(100vw - 48px));
        gap: 7px;
        cursor: pointer;
        list-style: none;
      }

      .branch-trigger::-webkit-details-marker {
        display: none;
      }

      .branch-chip::before {
        content: "";
        width: 12px;
        height: 12px;
        margin-right: 7px;
        border: 1.7px solid currentColor;
        border-radius: 50%;
      }

      .branch-icon {
        display: inline-block;
        width: 16px;
        height: 16px;
        flex: 0 0 auto;
        color: var(--fg-muted);
      }

      .branch-trigger-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .branch-trigger::after {
        content: "";
        width: 0;
        height: 0;
        margin-left: 8px;
        border-top: 4px solid currentColor;
        border-right: 4px solid transparent;
        border-left: 4px solid transparent;
        opacity: 0.8;
      }

      .branch-menu {
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        z-index: 30;
        width: min(360px, calc(100vw - 48px));
        overflow: hidden;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--canvas-default);
        box-shadow: var(--shadow-overlay);
      }

      .branch-menu-heading {
        border-bottom: 1px solid var(--border-muted);
        padding: 10px 12px;
        color: var(--fg-default);
        font-size: 12px;
        font-weight: 600;
      }

      .branch-list {
        display: grid;
        max-height: min(320px, 60vh);
        overflow: auto;
      }

      .branch-option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-width: 0;
        border-left: 3px solid transparent;
        border-bottom: 1px solid var(--border-muted);
        color: var(--fg-default);
        padding: 9px 12px 9px 9px;
        font-size: 13px;
        font-weight: 500;
      }

      .branch-option:last-child {
        border-bottom: 0;
      }

      .branch-option:hover {
        background: var(--canvas-muted);
        text-decoration: none;
      }

      .branch-option.is-active {
        border-left-color: var(--active-border);
        background: var(--canvas-muted);
      }

      .branch-option-main {
        display: inline-flex;
        min-width: 0;
        align-items: center;
        gap: 8px;
      }

      .branch-option-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .branch-default,
      .branch-option-sha {
        color: var(--fg-muted);
        font-size: 12px;
        font-weight: 500;
      }

      .branch-default {
        border: 1px solid var(--border-default);
        border-radius: 999px;
        padding: 0 6px;
      }

      .repo-stat {
        display: inline-flex;
        align-items: center;
        min-height: 32px;
        color: var(--fg-muted);
        font-size: 14px;
        font-weight: 600;
        white-space: nowrap;
      }

      .soft-chip {
        color: var(--fg-muted);
      }

      .info-dropdown {
        position: relative;
      }

      .code-dropdown {
        position: relative;
      }

      .info-trigger {
        border-color: var(--brand-border);
        background: var(--brand-bg);
        color: #ffffff;
        cursor: pointer;
        list-style: none;
      }

      .info-trigger::-webkit-details-marker {
        display: none;
      }

      .code-trigger {
        min-height: 32px;
        gap: 8px;
        border-color: var(--brand-border);
        background: var(--brand-bg);
        color: #ffffff;
        cursor: pointer;
        list-style: none;
      }

      .code-trigger:hover {
        background: var(--brand-hover);
      }

      .code-trigger::-webkit-details-marker {
        display: none;
      }

      .code-trigger::after {
        content: "";
        width: 0;
        height: 0;
        margin-left: 2px;
        border-top: 4px solid currentColor;
        border-right: 4px solid transparent;
        border-left: 4px solid transparent;
      }

      .code-icon {
        display: inline-block;
        width: 16px;
        height: 16px;
        flex: 0 0 auto;
      }

      .toolbar .notice {
        flex-basis: 100%;
      }

      .table-wrap,
      .repo-list,
      .repo-list-item,
      .panel,
      .summary-panel {
        overflow: hidden;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--canvas-default);
        box-shadow: var(--shadow-small);
      }

      .table-wrap {
        overflow-x: auto;
      }

      .repo-list {
        display: grid;
      }

      .repo-list-item {
        border-width: 0 0 1px;
        border-radius: 0;
        box-shadow: none;
        padding: 20px 24px;
      }

      .repo-list-item:last-child {
        border-bottom: 0;
      }

      .repo-list-main {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }

      .repo-list-title {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 8px;
        margin: 0 0 10px;
        font-size: 20px;
      }

      .repo-list-title a {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .repo-list-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 12px 18px;
        margin: 0;
        padding: 0;
        color: var(--fg-muted);
        font-size: 12px;
        list-style: none;
      }

      .repo-list-meta li {
        min-width: 0;
      }

      .repo-list-meta code {
        max-width: 360px;
      }

      .repo-list-action {
        flex: 0 0 auto;
      }

      .dashboard-page {
        width: 100%;
        margin: 0;
        padding: 0;
      }

      .dashboard-layout {
        display: grid;
        min-height: calc(100vh - 64px);
        grid-template-columns: minmax(0, 1fr);
      }

      .dashboard-sidebar {
        border-right: 1px solid var(--border-default);
        background: var(--canvas-muted);
        padding: 24px;
      }

      .dashboard-main {
        width: min(900px, calc(100% - 32px));
        margin: 0 auto;
        padding: 36px 32px 56px;
      }

      .dashboard-aside {
        border-left: 1px solid var(--border-default);
        background: var(--canvas-default);
        padding: 36px 24px;
      }

      .dashboard-user {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 36px;
        color: var(--fg-default);
        font-weight: 600;
      }

      .dashboard-user img,
      .dashboard-feed-avatar {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: var(--canvas-default);
      }

      .dashboard-section-title {
        margin: 0 0 12px;
        color: var(--fg-default);
        font-size: 14px;
        font-weight: 600;
      }

      .dashboard-repo-list {
        display: grid;
        gap: 10px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .dashboard-repo-link {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 8px;
        color: var(--fg-default);
        font-size: 14px;
        font-weight: 500;
      }

      .dashboard-repo-link:hover {
        color: var(--accent-fg);
      }

      .dashboard-repo-icon {
        width: 16px;
        height: 16px;
        flex: 0 0 auto;
      }

      .dashboard-repo-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .dashboard-home-title {
        margin: 0 0 18px;
        font-size: 24px;
        line-height: 1.25;
      }

      .dashboard-summary {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 28px;
      }

      .dashboard-stat-card,
      .dashboard-feed-card,
      .dashboard-side-card {
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--canvas-default);
        box-shadow: var(--shadow-small);
      }

      .dashboard-stat-card {
        display: grid;
        gap: 4px;
        padding: 14px 16px;
      }

      .dashboard-stat-card strong {
        color: var(--fg-default);
        font-size: 20px;
        line-height: 1.2;
      }

      .dashboard-stat-card span {
        color: var(--fg-muted);
        font-size: 12px;
      }

      .dashboard-feed-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 12px;
      }

      .dashboard-feed-header h2 {
        margin: 0;
        font-size: 16px;
      }

      .dashboard-feed {
        display: grid;
        gap: 14px;
      }

      .dashboard-feed-card {
        padding: 16px;
      }

      .dashboard-feed-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
        color: var(--fg-muted);
      }

      .dashboard-feed-title {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 10px;
      }

      .dashboard-feed-title strong {
        color: var(--fg-default);
      }

      .dashboard-feed-repo {
        display: grid;
        gap: 10px;
        border-radius: 6px;
        background: var(--canvas-muted);
        padding: 14px;
      }

      .dashboard-feed-repo-head {
        display: flex;
        min-width: 0;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .dashboard-feed-repo-title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .dashboard-side-card {
        padding: 16px;
      }

      .dashboard-side-list {
        display: grid;
        gap: 14px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .dashboard-side-list li {
        display: grid;
        gap: 4px;
      }

      .dashboard-side-list span {
        color: var(--fg-muted);
        font-size: 12px;
      }

      .profile-layout {
        display: grid;
        grid-template-columns: 280px minmax(0, 1fr);
        gap: 32px;
        align-items: start;
      }

      .profile-sidebar {
        display: grid;
        gap: 14px;
      }

      .profile-avatar {
        width: 240px;
        max-width: 100%;
        height: 240px;
        aspect-ratio: 1;
        border: 1px solid var(--border-default);
        border-radius: 50%;
        background: var(--canvas-muted);
        object-fit: contain;
        padding: 44px;
      }

      .profile-name {
        display: block;
        margin: 0;
        color: var(--fg-default);
        font-size: 24px;
        font-weight: 600;
        line-height: 1.25;
        overflow-wrap: anywhere;
      }

      .profile-handle {
        margin: 2px 0 0;
        color: var(--fg-muted);
        font-size: 20px;
        font-weight: 300;
        line-height: 1.2;
        overflow-wrap: anywhere;
      }

      .profile-stats {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 0;
        padding: 0;
        color: var(--fg-muted);
        list-style: none;
      }

      .profile-stats strong {
        color: var(--fg-default);
      }

      .profile-main {
        min-width: 0;
      }

      .profile-main-heading {
        margin: 0 0 12px;
        color: var(--fg-default);
        font-size: 16px;
        font-weight: 600;
      }

      .popular-repo-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }

      .popular-repo-card {
        display: grid;
        min-height: 120px;
        align-content: space-between;
        gap: 16px;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--canvas-default);
        padding: 16px;
        box-shadow: var(--shadow-small);
      }

      .popular-repo-card-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .popular-repo-title {
        overflow: hidden;
        color: var(--accent-fg);
        font-size: 16px;
        font-weight: 600;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .popular-repo-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin: 0;
        padding: 0;
        color: var(--fg-muted);
        font-size: 12px;
        list-style: none;
      }

      .popular-repo-meta li {
        display: inline-flex;
        align-items: center;
      }

      .repo-dot {
        width: 10px;
        height: 10px;
        margin-right: 5px;
        border-radius: 50%;
        background: var(--accent-fg);
      }

      .contribution-section {
        margin-top: 32px;
      }

      .contribution-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 12px;
      }

      .contribution-heading h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 400;
      }

      .contribution-year {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 86px;
        min-height: 32px;
        border-radius: 6px;
        background: var(--brand-bg);
        color: #ffffff;
        padding: 0 14px;
        font-weight: 600;
      }

      .contribution-card {
        overflow-x: auto;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--canvas-default);
        padding: 16px;
        box-shadow: var(--shadow-small);
      }

      .contribution-calendar {
        width: max-content;
        min-width: 100%;
      }

      .contribution-months {
        display: grid;
        grid-auto-columns: 13px;
        grid-auto-flow: column;
        height: 22px;
        margin-left: 40px;
        column-gap: 3px;
      }

      .contribution-month {
        overflow: visible;
        color: var(--fg-muted);
        font-size: 12px;
        line-height: 16px;
        white-space: nowrap;
      }

      .contribution-body {
        display: flex;
        gap: 8px;
        align-items: flex-start;
      }

      .contribution-weekdays {
        display: grid;
        width: 32px;
        grid-template-rows: repeat(7, 13px);
        color: var(--fg-muted);
        font-size: 12px;
        line-height: 10px;
      }

      .contribution-weeks {
        display: flex;
        gap: 3px;
      }

      .contribution-week {
        display: grid;
        grid-template-rows: repeat(7, 10px);
        gap: 3px;
      }

      .contribution-day {
        width: 10px;
        height: 10px;
        border: 1px solid rgba(31, 35, 40, 0.06);
        border-radius: 2px;
        background: var(--contribution-empty);
      }

      .contribution-day.is-outside {
        opacity: 0.35;
      }

      .contribution-day.level-1 {
        background: var(--contribution-l1);
      }

      .contribution-day.level-2 {
        background: var(--contribution-l2);
      }

      .contribution-day.level-3 {
        background: var(--contribution-l3);
      }

      .contribution-day.level-4 {
        background: var(--contribution-l4);
      }

      .contribution-footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 6px;
        margin-top: 12px;
        color: var(--fg-muted);
        font-size: 12px;
      }

      .contribution-legend {
        display: inline-flex;
        gap: 3px;
      }

      .activity-section {
        margin-top: 24px;
      }

      .activity-heading {
        margin: 0 0 18px;
        color: var(--fg-default);
        font-size: 20px;
        font-weight: 400;
      }

      .activity-timeline {
        display: grid;
        gap: 26px;
      }

      .activity-month {
        display: grid;
        gap: 14px;
      }

      .activity-month-heading {
        display: flex;
        align-items: center;
        gap: 12px;
        color: var(--fg-default);
        font-size: 14px;
        font-weight: 600;
      }

      .activity-month-heading::after {
        content: "";
        height: 1px;
        flex: 1 1 auto;
        background: var(--border-default);
      }

      .activity-group {
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr);
        gap: 12px;
      }

      .activity-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: 1px solid var(--border-muted);
        border-radius: 50%;
        background: var(--canvas-muted);
        color: var(--fg-muted);
        font-size: 14px;
        line-height: 1;
      }

      .activity-content {
        min-width: 0;
        padding-top: 2px;
      }

      .activity-title {
        margin: 0 0 8px;
        color: var(--fg-default);
        font-size: 16px;
        font-weight: 400;
      }

      .activity-list {
        display: grid;
        gap: 7px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .activity-list li {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
      }

      .activity-repo-link {
        overflow: hidden;
        color: var(--accent-fg);
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .activity-meta {
        color: var(--fg-muted);
        font-size: 12px;
        white-space: nowrap;
      }

      .activity-bar {
        display: inline-block;
        width: min(156px, calc(var(--activity-scale, 1) * 156px));
        min-width: 8px;
        height: 8px;
        border-radius: 999px;
        background: var(--contribution-l4);
        vertical-align: middle;
      }

      .github-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 32px;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--canvas-muted);
        color: var(--fg-default);
        padding: 0 12px;
        font-size: 14px;
        font-weight: 500;
        line-height: 20px;
        white-space: nowrap;
      }

      .github-button:hover {
        background: var(--button-hover);
        text-decoration: none;
      }

      .github-button.primary {
        border-color: var(--brand-border);
        background: var(--brand-bg);
        color: #ffffff;
      }

      .github-button.primary:hover {
        background: var(--brand-hover);
      }

      .panel {
        padding: 16px;
      }

      .private-gate {
        display: grid;
        width: min(560px, 100%);
        gap: 14px;
        margin: 36px auto;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--canvas-default);
        padding: 28px;
        text-align: center;
        box-shadow: var(--shadow-small);
      }

      .private-gate h2 {
        margin: 0;
        font-size: 20px;
      }

      .private-gate p {
        margin: 0;
        color: var(--fg-muted);
      }

      .private-gate-actions {
        display: flex;
        justify-content: center;
      }

      .info-dropdown .summary-panel,
      .code-dropdown .summary-panel {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        z-index: 20;
        width: min(560px, 50vw);
        min-width: min(420px, calc(100vw - 48px));
        max-height: min(70vh, 560px);
        overflow: auto;
        box-shadow: var(--shadow-overlay);
      }

      .code-dropdown .summary-panel {
        width: min(520px, 70vw);
      }

      .summary-tabs,
      .clone-tabs {
        display: flex;
        gap: 2px;
        border-bottom: 1px solid var(--border-muted);
        padding: 0 12px;
      }

      .summary-tab,
      .clone-tab {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        border-bottom: 2px solid transparent;
        color: var(--fg-muted);
        padding: 0 10px;
        font-size: 13px;
        font-weight: 600;
      }

      .summary-tab.is-active,
      .clone-tab.is-active {
        border-bottom-color: var(--active-border);
        color: var(--fg-default);
      }

      .clone-panel {
        padding: 16px;
      }

      .clone-heading {
        margin: 0 0 12px;
        color: var(--fg-default);
        font-size: 16px;
        font-weight: 600;
      }

      .clone-tabs {
        margin: 0 0 12px;
        padding: 0;
      }

      .clone-command + .clone-command {
        margin-top: 12px;
      }

      .clone-label,
      .summary-label {
        display: block;
        margin: 0 0 6px;
        color: var(--fg-muted);
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
      }

      .clone-url,
      code {
        display: inline-flex;
        max-width: 100%;
        overflow: hidden;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--canvas-muted);
        color: var(--fg-default);
        padding: 4px 8px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .clone-url {
        display: block;
        padding: 8px 10px;
      }

      .clone-description,
      .summary-copy {
        margin: 12px 0 0;
        color: var(--fg-muted);
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      }

      .summary-item {
        min-width: 0;
        border-right: 1px solid var(--border-muted);
        border-bottom: 1px solid var(--border-muted);
        padding: 14px 16px;
      }

      .summary-wide {
        grid-column: span 2;
      }

      .summary-value,
      .summary-list strong,
      .summary-list span {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .summary-value {
        color: var(--fg-default);
        font-size: 14px;
      }

      .summary-list {
        display: grid;
        gap: 8px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .summary-list strong {
        color: var(--fg-default);
        font-size: 13px;
      }

      .summary-list span {
        color: var(--fg-muted);
        font-size: 12px;
      }

      table {
        width: 100%;
        min-width: 860px;
        border-collapse: separate;
        border-spacing: 0;
      }

      .compact {
        min-width: 0;
      }

      th,
      td {
        padding: 12px 16px;
        border-bottom: 1px solid var(--border-muted);
        text-align: left;
        vertical-align: middle;
      }

      th {
        background: var(--canvas-muted);
        color: var(--fg-muted);
        font-size: 12px;
        font-weight: 600;
      }

      tr:last-child td {
        border-bottom: 0;
      }

      tbody tr:hover {
        background: var(--canvas-muted);
      }

      .repo-link {
        display: inline-block;
        max-width: 280px;
        overflow: hidden;
        text-overflow: ellipsis;
        vertical-align: bottom;
        white-space: nowrap;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 20px;
        border: 1px solid var(--border-default);
        border-radius: 999px;
        background: transparent;
        color: var(--fg-muted);
        padding: 0 7px;
        font-size: 12px;
        font-weight: 500;
        text-transform: capitalize;
      }

      .empty {
        height: 116px;
        color: var(--fg-muted);
        text-align: center;
        vertical-align: middle;
      }

      .repo-list > .empty {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 160px;
        padding: 24px;
      }

      .notice {
        height: auto;
        border: 1px solid var(--notice-border);
        border-radius: 6px;
        background: var(--notice-bg);
        color: var(--attention-fg);
        margin: 0;
        padding: 10px 12px;
        text-align: left;
      }

      .crumbs,
      .stats {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        min-width: 0;
        color: var(--fg-muted);
      }

      .file-browser-table {
        table-layout: fixed;
        min-width: 760px;
      }

      .file-browser-table td {
        text-align: left;
      }

      .file-browser-summary-cell {
        padding: 0;
      }

      .file-browser-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        min-height: 48px;
        background: var(--canvas-muted);
        padding: 10px 16px;
      }

      .commit-lead,
      .commit-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .commit-lead {
        flex: 1;
      }

      .avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        flex: 0 0 auto;
        border-radius: 50%;
        background: var(--avatar-bg);
        color: #ffffff;
        font-size: 11px;
        font-weight: 700;
      }

      .commit-author,
      .commit-message,
      .entry-name {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .commit-author,
      .commit-count {
        color: var(--fg-default);
        font-weight: 600;
      }

      .commit-message,
      .commit-meta,
      .file-message-cell,
      .file-time-cell {
        color: var(--fg-muted);
      }

      .file-name-cell {
        width: 40%;
      }

      .file-time-cell {
        width: 160px;
        text-align: right;
        white-space: nowrap;
      }

      .entry-link {
        display: inline-flex;
        align-items: center;
        max-width: 100%;
        gap: 10px;
        color: var(--accent-fg);
        font-weight: 600;
      }

      .entry-icon {
        position: relative;
        display: inline-flex;
        width: 16px;
        height: 16px;
        flex: 0 0 auto;
      }

      .entry-icon.folder::before,
      .entry-icon.file::before,
      .entry-icon.folder::after {
        content: "";
        position: absolute;
        display: block;
      }

      .entry-icon.folder::before {
        left: 1px;
        top: 5px;
        width: 14px;
        height: 9px;
        border: 1px solid var(--folder-fg);
        border-radius: 2px;
        background: var(--folder-bg);
      }

      .entry-icon.folder::after {
        left: 2px;
        top: 2px;
        width: 7px;
        height: 4px;
        border: 1px solid var(--folder-fg);
        border-bottom: 0;
        border-radius: 2px 2px 0 0;
        background: var(--folder-bg);
      }

      .entry-icon.file::before {
        left: 3px;
        top: 1px;
        width: 10px;
        height: 14px;
        border: 1px solid var(--fg-muted);
        border-radius: 2px;
        background: var(--canvas-default);
      }

      pre {
        overflow: auto;
        margin: 0;
        max-height: 72vh;
        border-radius: 6px;
        background: var(--canvas-muted);
        color: var(--fg-default);
        padding: 16px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        font-size: 12px;
        line-height: 1.55;
        white-space: pre-wrap;
      }

      @media (max-width: 860px) {
        main,
        .bar {
          width: calc(100% - 24px);
        }

        .site-topbar-inner {
          width: calc(100% - 24px);
        }

        .repo-list-main {
          flex-direction: column;
        }

        .repo-list-action {
          width: 100%;
        }

        .repo-list-action .github-button {
          width: 100%;
        }

        .profile-layout {
          grid-template-columns: 1fr;
        }

        .profile-sidebar {
          grid-template-columns: 72px minmax(0, 1fr);
          align-items: center;
        }

        .profile-avatar {
          width: 72px;
          height: 72px;
          padding: 14px;
        }

        .profile-stats {
          grid-column: 1 / -1;
        }

        .popular-repo-grid {
          grid-template-columns: 1fr;
        }

        .dashboard-layout {
          grid-template-columns: 1fr;
        }

        .dashboard-sidebar,
        .dashboard-aside {
          border: 0;
          border-bottom: 1px solid var(--border-default);
        }

        .dashboard-main {
          padding: 24px 12px 40px;
        }

        .dashboard-summary {
          grid-template-columns: 1fr;
        }

        .contribution-heading {
          align-items: flex-start;
          flex-direction: column;
        }

        .contribution-year {
          min-width: 72px;
        }

        .activity-group {
          grid-template-columns: 24px minmax(0, 1fr);
        }

        .activity-icon {
          width: 24px;
          height: 24px;
          font-size: 12px;
        }

        .activity-list li {
          grid-template-columns: 1fr;
          gap: 3px;
        }

        .activity-meta {
          white-space: normal;
        }

        .bar {
          align-items: flex-start;
          flex-direction: column;
          min-height: 0;
        }

        .info-dropdown .summary-panel,
        .code-dropdown .summary-panel {
          position: fixed;
          top: 120px;
          right: 12px;
          left: 12px;
          width: auto;
          min-width: 0;
        }

        .summary-wide {
          grid-column: 1 / -1;
        }

        .file-browser-summary {
          align-items: flex-start;
          flex-direction: column;
        }

        h1 {
          font-size: 18px;
        }
      }

      @media (max-width: 520px) {
        .site-topbar-inner {
          min-height: 56px;
        }
      }
`;

const faviconLinks = `
    <link rel="icon" href="/favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
    <link rel="manifest" href="/site.webmanifest">
    <meta name="theme-color" content="#7c3aed" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#010409" media="(prefers-color-scheme: dark)">`;

const topNavigation = (viewer?: WebViewer): string => {
  const auth = viewer
    ? `<div class="site-auth">
        <span class="site-wallet" title="${escapeAttr(viewer.walletAddress)}">${escapeHtml(shortWallet(viewer.walletAddress))}</span>
        <form class="site-auth-form" method="post" action="/logout">
          <button class="site-auth-button" type="submit">Sign out</button>
        </form>
      </div>`
    : `<div class="site-auth"><a class="site-auth-link" href="/login" data-octopus-auth-popup>Sign in</a></div>`;

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

const authPopupScript = `
    <script>
      (() => {
        const walletsState = {
          initialized: false,
          cached: null,
          wallets: new Set(),
          listeners: { register: [], unregister: [] }
        };

        class OctopusWalletAppReadyEvent extends Event {
          constructor(api) {
            super("wallet-standard:app-ready", { bubbles: false, cancelable: false, composed: false });
            this.detail = api;
          }

          preventDefault() {
            throw new Error("preventDefault cannot be called");
          }

          stopImmediatePropagation() {
            throw new Error("stopImmediatePropagation cannot be called");
          }

          stopPropagation() {
            throw new Error("stopPropagation cannot be called");
          }
        }

        const emitWalletEvent = (eventName, wallets) => {
          for (const listener of walletsState.listeners[eventName] || []) {
            try {
              listener(...wallets);
            } catch (error) {
              console.error(error);
            }
          }
        };

        const registerWallets = (...wallets) => {
          const nextWallets = wallets.filter((wallet) => !walletsState.wallets.has(wallet));
          if (nextWallets.length === 0) {
            return () => {};
          }
          walletsState.cached = null;
          for (const wallet of nextWallets) {
            walletsState.wallets.add(wallet);
          }
          emitWalletEvent("register", nextWallets);
          return () => {
            walletsState.cached = null;
            for (const wallet of nextWallets) {
              walletsState.wallets.delete(wallet);
            }
            emitWalletEvent("unregister", nextWallets);
          };
        };

        const walletApi = () => {
          if (!walletsState.initialized) {
            walletsState.initialized = true;
            const api = Object.freeze({ register: registerWallets });
            window.addEventListener("wallet-standard:register-wallet", (event) => event.detail(api));
            window.dispatchEvent(new OctopusWalletAppReadyEvent(api));
          }

          return {
            get: () => {
              walletsState.cached ||= [...walletsState.wallets];
              return walletsState.cached;
            },
            on: (eventName, listener) => {
              walletsState.listeners[eventName]?.push(listener);
              return () => {
                walletsState.listeners[eventName] = walletsState.listeners[eventName]?.filter((item) => item !== listener) || [];
              };
            }
          };
        };

        const waitForWallets = async () => {
          const api = walletApi();
          if (api.get().length > 0) {
            return api.get();
          }
          await new Promise((resolve) => {
            const off = api.on("register", () => {
              off();
              resolve();
            });
            window.setTimeout(() => {
              off();
              resolve();
            }, 900);
          });
          return api.get();
        };

        const isSuiWallet = (wallet) => {
          const features = wallet?.features || {};
          return Boolean(
            features["standard:connect"]?.connect &&
            features["sui:signPersonalMessage"]?.signPersonalMessage &&
            wallet.chains?.some((chain) => String(chain).startsWith("sui:"))
          );
        };

        const accountCanSign = (account) => {
          return account?.features?.includes("sui:signPersonalMessage") && account.chains?.some((chain) => String(chain).startsWith("sui:"));
        };

        const walletScore = (wallet) => {
          const name = String(wallet.name || "").toLowerCase();
          return (name.includes("slush") ? 100 : 0) + ((wallet.accounts || []).length > 0 ? 10 : 0);
        };

        const pickAccount = (accounts, preferredAddress) => {
          const normalizedPreferred = preferredAddress ? preferredAddress.toLowerCase() : "";
          if (normalizedPreferred) {
            const preferred = accounts.find((account) => accountCanSign(account) && account.address.toLowerCase() === normalizedPreferred);
            if (preferred) {
              return preferred;
            }
          }
          return accounts.find(accountCanSign) || null;
        };

        const getSigner = async (preferredAddress) => {
          const wallets = (await waitForWallets()).filter(isSuiWallet).sort((left, right) => walletScore(right) - walletScore(left));
          if (wallets.length === 0) {
            throw new Error("No Sui wallet found.");
          }

          for (const wallet of wallets) {
            const existingAccount = pickAccount(wallet.accounts || [], preferredAddress);
            if (existingAccount) {
              return { wallet, account: existingAccount };
            }
          }

          const wallet = wallets[0];
          const result = await wallet.features["standard:connect"].connect();
          const accounts = [...(result.accounts || []), ...(wallet.accounts || [])];
          const account = pickAccount(accounts, preferredAddress);
          if (!account) {
            throw new Error("No Sui account was authorized.");
          }
          return { wallet, account };
        };

        const signMessage = async (signer, message) => {
          return await signer.wallet.features["sui:signPersonalMessage"].signPersonalMessage({
            message: new TextEncoder().encode(message),
            account: signer.account
          });
        };

        const fetchJson = async (path, options = {}) => {
          const response = await fetch(path, {
            credentials: "same-origin",
            ...options,
            headers: {
              ...(options.headers || {})
            }
          });
          const body = await response.json();
          if (!response.ok) {
            throw new Error(body.error || "HTTP " + response.status);
          }
          return body;
        };

        const currentReturnTo = () => {
          return window.location.pathname + window.location.search + window.location.hash;
        };

        const webSession = async () => {
          return await fetchJson("/v1/auth/web-session");
        };

        const ensureWebSession = async (signer, returnTo) => {
          const session = await webSession();
          if (session.authenticated && session.walletAddress?.toLowerCase() === signer.account.address.toLowerCase()) {
            return session;
          }

          const challengeUrl = new URL("/v1/auth/web-session/challenge", window.location.origin);
          challengeUrl.searchParams.set("returnTo", returnTo || currentReturnTo());
          const challenge = await fetchJson(challengeUrl.pathname + challengeUrl.search);
          const signed = await signMessage(signer, challenge.message);
          return await fetchJson("/v1/auth/web-session", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              nonce: challenge.nonce,
              walletAddress: signer.account.address,
              signature: signed.signature
            })
          });
        };

        const unlockRepository = async (signer, owner, repo, returnTo) => {
          await ensureWebSession(signer, returnTo);
          const basePath = "/v1/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo);
          const challengeUrl = new URL(basePath + "/unlock/challenge", window.location.origin);
          challengeUrl.searchParams.set("returnTo", returnTo || currentReturnTo());
          const challenge = await fetchJson(challengeUrl.pathname + challengeUrl.search);
          if (challenge.unlocked) {
            window.location.assign(returnTo || currentReturnTo());
            return;
          }

          const signed = await signMessage(signer, challenge.message);
          await fetchJson(basePath + "/unlock", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              nonce: challenge.nonce,
              signature: signed.signature
            })
          });
          window.location.assign(returnTo || currentReturnTo());
        };

        const parseRepoFromLocation = () => {
          const parts = window.location.pathname.split("/").filter(Boolean);
          return parts.length >= 2 ? { owner: decodeURIComponent(parts[0]), repo: decodeURIComponent(parts[1]) } : null;
        };

        document.addEventListener("click", (event) => {
          const trigger = event.target.closest("[data-octopus-auth-popup]");
          if (!trigger) {
            return;
          }
          const href = trigger.getAttribute("href");
          if (!href) {
            return;
          }
          event.preventDefault();
          const url = new URL(href, window.location.href);
          const mode = url.searchParams.get("mode") || "web";
          const returnTo = url.searchParams.get("returnTo") || currentReturnTo();
          const locationRepo = parseRepoFromLocation();
          const owner = url.searchParams.get("owner") || locationRepo?.owner || "";
          const repo = url.searchParams.get("repo") || locationRepo?.repo || "";
          trigger.setAttribute("aria-busy", "true");

          (async () => {
            const signer = await getSigner();
            if (mode === "unlock") {
              if (!owner || !repo) {
                throw new Error("Missing repository unlock target.");
              }
              await unlockRepository(signer, owner, repo, returnTo);
              return;
            }
            await ensureWebSession(signer, returnTo);
            window.location.assign(returnTo || currentReturnTo());
          })().catch((error) => {
            trigger.removeAttribute("aria-busy");
            console.error(error);
          });
        });
      })();
    </script>`;

const branchIcon = `<svg class="branch-icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M9.5 3.25a2.25 2.25 0 1 1 3 2.12V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.13a2.25 2.25 0 1 1-1.5 0V5.37a2.25 2.25 0 1 1 1.5 0v1.84A2.5 2.5 0 0 1 6 7h4a1 1 0 0 0 1-1v-.63a2.25 2.25 0 0 1-1.5-2.12Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75.75 0 0 0 0-1.5Z"></path></svg>`;

const codeIcon = `<svg class="code-icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M5.22 4.22a.75.75 0 0 1 0 1.06L2.5 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L.97 8.59a.83.83 0 0 1 0-1.18l3.19-3.19a.75.75 0 0 1 1.06 0Zm5.56 0a.75.75 0 0 1 1.06 0l3.19 3.19a.83.83 0 0 1 0 1.18l-3.19 3.19a.75.75 0 1 1-1.06-1.06L13.5 8l-2.72-2.72a.75.75 0 0 1 0-1.06Z"></path></svg>`;

type BranchSelectorTarget = {
  view: "tree" | "commits" | "blob";
  path?: string;
};

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

const renderBranchSelector = (
  repo: RepoListItem,
  ref: string,
  target: BranchSelectorTarget
): string => {
  const currentShortRef = shortRef(ref);
  const branches = repo.refs.length > 0
    ? repo.refs
    : [{
        name: repo.defaultBranch,
        shortName: shortRef(repo.defaultBranch),
        commitDigest: repo.defaultBranchCommit ?? "",
        updatedAtMs: repo.updatedAtMs,
        isDefault: true
      }];

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

const repoHeader = (
  repo: RepoListItem,
  subtitle: string
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
        </div>
        <div class="meta visibility-meta"><span class="badge">${escapeHtml(repo.visibility)}</span></div>
      </div>
    </header>`;
};

const renderRepoCards = (repos: RepoListItem[], emptyMessage: string): string => {
  return (
    repos.length === 0
      ? `<div class="empty">${escapeHtml(emptyMessage)}</div>`
      : repos
          .map((repo) => {
            const repoId = escapeHtml(repo.repoId);
            const repoHref = `/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
            const commitMeta =
              typeof repo.commitCount === "number"
                ? `<li>${escapeHtml(pluralize(repo.commitCount, "commit"))}</li>`
                : "";

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
          .join("")
  );
};

const renderPopularRepoCards = (repos: RepoListItem[], emptyMessage: string): string => {
  if (repos.length === 0) {
    return `<section class="repo-list" aria-label="Repositories"><div class="empty">${escapeHtml(emptyMessage)}</div></section>`;
  }

  return `<section class="popular-repo-grid" aria-label="Popular repositories">
    ${repos.slice(0, 6).map((repo) => {
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
    }).join("")}
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
          const className = [
            "contribution-day",
            `level-${day.level}`,
            day.inRange ? "" : "is-outside"
          ].filter(Boolean).join(" ");
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
          <a class="github-button primary" href="${escapeAttr(input.loginHref)}" data-octopus-auth-popup>Sign in with Sui wallet</a>
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

const renderTreeRows = (repo: RepoListItem, ref: string, entries: TreeEntry[], latestCommit: IndexedCommit | undefined): string => {
  if (entries.length === 0) {
    return `<tr><td colspan="3" class="empty">No files in this tree.</td></tr>`;
  }

  const commitSubject = latestCommit?.subject ?? "No commits indexed yet";
  const commitTime = latestCommit ? formatRelativeDate(latestCommit.authoredAt) : "";

  return entries
    .map((entry) => {
      const displayName = entry.type === "tree" ? `${escapeHtml(entry.name)}/` : escapeHtml(entry.name);
      const href =
        entry.type === "tree"
          ? `/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/tree?ref=${encodeURIComponent(ref)}&path=${encodeURIComponent(entry.path)}`
          : `/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/blob?ref=${encodeURIComponent(ref)}&path=${encodeURIComponent(entry.path)}`;
      const iconClass = entry.type === "tree" ? "folder" : "file";

      return `<tr class="file-browser-row">
        <td class="file-name-cell">
          <a class="entry-link" href="${href}" title="${escapeAttr(entry.path)}">
            <i class="entry-icon ${iconClass}" aria-hidden="true"></i>
            <span class="entry-name">${displayName}</span>
          </a>
        </td>
        <td class="file-message-cell"><span class="commit-message" title="${escapeAttr(commitSubject)}">${escapeHtml(commitSubject)}</span></td>
        <td class="file-time-cell"><span title="${escapeAttr(latestCommit?.authoredAt ?? "")}">${escapeHtml(commitTime)}</span></td>
      </tr>`;
    })
    .join("");
};

const renderFileBrowserHeader = (repo: RepoListItem, ref: string, commits: IndexedCommit[], commitCount: number): string => {
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

  const relativeDate = formatRelativeDate(latestCommit.authoredAt);
  return `<tr class="file-browser-summary-row">
    <td colspan="3" class="file-browser-summary-cell">
      <div class="file-browser-summary">
        <div class="commit-lead">
          <span class="avatar">${escapeHtml(initials(latestCommit.authorName))}</span>
          <strong class="commit-author" title="${escapeAttr(latestCommit.authorName)}">${escapeHtml(latestCommit.authorName)}</strong>
          <a class="commit-message" href="${commitsHref}" title="${escapeAttr(latestCommit.subject)}">${escapeHtml(latestCommit.subject)}</a>
        </div>
        <div class="commit-meta">
          <a href="${commitsHref}"><code>${escapeHtml(latestCommit.oid.slice(0, 7))}</code></a>
          <span title="${escapeAttr(latestCommit.authoredAt)}">${escapeHtml(relativeDate)}</span>
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
    .map((commit) => `<li>
      <strong title="${escapeAttr(commit.subject)}">${escapeHtml(commit.subject)}</strong>
      <span><code>${escapeHtml(commit.oid.slice(0, 8))}</code> ${escapeHtml(commit.authoredAt)}</span>
    </li>`)
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

export const renderRepoPage = (input: {
  repo: RepoListItem;
  index: RepoIndex;
  commits: IndexedCommit[];
  tree: TreeEntry[];
  ref: string;
  path: string;
  origin?: string;
  viewer?: WebViewer;
}): string => {
  const repo = input.repo;
  const repoId = escapeHtml(repo.repoId);
  const latestCommit = input.commits[0];
  const visibleCommitCount = commitCountForRef(input.index, input.ref, input.commits);
  const breadcrumbTrail = breadcrumbs(repo, input.ref, input.path);
  const treeRows = renderTreeRows(repo, input.ref, input.tree, latestCommit);
  const fileBrowserHeader = renderFileBrowserHeader(repo, input.ref, input.commits, visibleCommitCount);
  const remoteUrl = joinOriginPath(input.origin, repo.gitRemotePath);
  const cloneCommand = `git clone ${remoteUrl}`;
  const indexNotice = input.index.treeTruncated
    ? `<p class="notice">File index is truncated at ${input.index.treeEntryCount} entries. Increase OCTOPUS_INDEX_TREE_LIMIT for larger repositories.</p>`
    : "";

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
    ${repoHeader(repo, `Repository ${repoId} on ${shortRef(input.ref)}`)}
    <main class="stack">
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
                  <span class="clone-url" title="${escapeAttr(cloneCommand)}">${escapeHtml(cloneCommand)}</span>
                </div>
                <p class="clone-description">Run this command in your terminal.</p>
              </div>
            </section>
          </details>
        </div>
        ${indexNotice}
      </section>
      <section class="table-wrap">
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

            return `<tr>
              <td><code title="${escapeAttr(commit.oid)}">${escapeHtml(commit.oid.slice(0, 8))}</code></td>
              <td>
                <div class="commit-message" title="${escapeAttr(commit.subject)}">${escapeHtml(commit.subject)}</div>
                ${refs}
              </td>
              <td title="${escapeAttr(commit.authorName)}">${escapeHtml(commit.authorName)} ${mergeBadge}</td>
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
    ${repoHeader(repo, `Commits on ${shortRef(input.ref)}`)}
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
    ${repoHeader(repo, file.path)}
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
