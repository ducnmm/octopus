import type { RepoListItem } from "@ducnmm/octopus-shared";

const dayMs = 24 * 60 * 60 * 1000;
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const utcDay = (date: Date): Date => {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const addDays = (date: Date, days: number): Date => {
  return new Date(date.getTime() + days * dayMs);
};

const dateKey = (date: Date): string => {
  return date.toISOString().slice(0, 10);
};

export const formatContributionDate = (date: Date): string => {
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

export type ContributionDay = {
  key: string;
  label: string;
  count: number;
  level: number;
  inRange: boolean;
};

export type ContributionWeek = { monthLabel: string; days: ContributionDay[] };
export type ContributionCalendar = { total: number; weeks: ContributionWeek[] };

export const buildContributionCalendar = (repos: RepoListItem[]): ContributionCalendar => {
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

export type ActivityMonth = {
  key: string;
  label: string;
  commitTotal: number;
  commitRepos: Array<{ repo: RepoListItem; count: number }>;
  createdRepos: RepoListItem[];
};

export const buildContributionActivity = (repos: RepoListItem[]): ActivityMonth[] => {
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

    const month: ActivityMonth = {
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
