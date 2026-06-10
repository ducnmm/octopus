import type { RepoListItem } from "@ducnmm/octopus-shared";
import { Link, useParams } from "react-router";
import { AppShell } from "@/components/layout/AppShell.js";
import { DataBoundary } from "@/components/layout/DataBoundary.js";
import { Badge } from "@/components/ui/badge.js";
import { Card, CardContent } from "@/components/ui/card.js";
import { useApiData } from "@/hooks/useApiData.js";
import {
  buildContributionActivity,
  buildContributionCalendar,
  formatContributionDate
} from "@/lib/contributions.js";
import { formatRelativeDate, pluralize, repoBasePath } from "@/lib/format.js";
import { api } from "@/lib/octopus-api.js";

const LEVEL_CLASSES = [
  "bg-muted",
  "bg-emerald-200 dark:bg-emerald-900",
  "bg-emerald-400 dark:bg-emerald-700",
  "bg-emerald-500 dark:bg-emerald-600",
  "bg-emerald-700 dark:bg-emerald-400"
] as const;

const ContributionCalendar = ({ repos }: { repos: RepoListItem[] }) => {
  const calendar = buildContributionCalendar(repos);
  const currentYear = new Date().getFullYear();

  return (
    <section aria-label="Contribution graph" className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{pluralize(calendar.total, "contribution")} in the last year</h2>
        <span className="text-sm text-muted-foreground">{currentYear}</span>
      </div>
      <Card>
        <CardContent className="overflow-x-auto py-4">
          <div className="flex gap-[3px] text-[10px] text-muted-foreground" aria-hidden>
            {calendar.weeks.map((week, index) => (
              <span key={index} className="w-[10px]">
                {week.monthLabel}
              </span>
            ))}
          </div>
          <div className="mt-1 flex gap-[3px]">
            {calendar.weeks.map((week, weekIndex) => (
              <span key={weekIndex} className="flex flex-col gap-[3px]">
                {week.days.map((day) => {
                  const label = `${pluralize(day.count, "commit")} on ${day.label}`;
                  return (
                    <span
                      key={day.key}
                      title={label}
                      aria-label={label}
                      className={`size-[10px] rounded-[2px] ${LEVEL_CLASSES[day.level] ?? LEVEL_CLASSES[0]} ${
                        day.inRange ? "" : "opacity-30"
                      }`}
                    />
                  );
                })}
              </span>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground" aria-hidden>
            <span>Less</span>
            {LEVEL_CLASSES.map((className, level) => (
              <span key={level} className={`size-[10px] rounded-[2px] ${className}`} />
            ))}
            <span>More</span>
          </div>
        </CardContent>
      </Card>
    </section>
  );
};

const ContributionActivity = ({ repos }: { repos: RepoListItem[] }) => {
  const months = buildContributionActivity(repos);

  return (
    <section aria-label="Contribution activity" className="space-y-4">
      <h2 className="text-base font-semibold">Contribution activity</h2>
      {months.length === 0 ? (
        <p className="text-sm text-muted-foreground">No contribution activity in the last year.</p>
      ) : (
        <div className="space-y-6 border-l pl-4">
          {months.map((month) => (
            <section key={month.key} aria-label={`${month.label} activity`} className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">{month.label}</h3>
              {month.commitTotal > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">
                    Created {pluralize(month.commitTotal, "commit")} in{" "}
                    {pluralize(month.commitRepos.length, "repository", "repositories")}
                  </h4>
                  <ul className="space-y-1 text-sm">
                    {month.commitRepos.slice(0, 6).map((item) => (
                      <li key={item.repo.repoId} className="flex items-center justify-between gap-2">
                        <Link
                          to={repoBasePath(item.repo)}
                          title={item.repo.repoId}
                          className="truncate text-primary hover:underline"
                        >
                          {item.repo.repoId}
                        </Link>
                        <span className="shrink-0 text-muted-foreground">{pluralize(item.count, "commit")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {month.createdRepos.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">
                    Created {pluralize(month.createdRepos.length, "repository", "repositories")}
                  </h4>
                  <ul className="space-y-1 text-sm">
                    {month.createdRepos.slice(0, 6).map((repo) => (
                      <li key={repo.repoId} className="flex items-center justify-between gap-2">
                        <Link to={repoBasePath(repo)} title={repo.repoId} className="truncate text-primary hover:underline">
                          {repo.repoId}
                        </Link>
                        <span className="shrink-0 text-muted-foreground">
                          {repo.visibility} · {formatContributionDate(new Date(repo.createdAtMs))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </section>
  );
};

const PopularRepoGrid = ({ repos, emptyMessage }: { repos: RepoListItem[]; emptyMessage: string }) =>
  repos.length === 0 ? (
    <Card>
      <CardContent className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</CardContent>
    </Card>
  ) : (
    <div className="grid gap-3 sm:grid-cols-2" aria-label="Popular repositories">
      {repos.slice(0, 6).map((repo) => (
        <Card key={repo.repoId}>
          <CardContent className="space-y-2 py-4">
            <div className="flex items-center justify-between gap-2">
              <Link
                to={repoBasePath(repo)}
                title={repo.repoId}
                className="truncate font-semibold text-primary hover:underline"
              >
                {repo.name}
              </Link>
              <Badge variant="outline" className="capitalize">
                {repo.visibility}
              </Badge>
            </div>
            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <li>{pluralize(repo.refCount, "branch", "branches")}</li>
              {typeof repo.commitCount === "number" ? <li>{pluralize(repo.commitCount, "commit")}</li> : null}
              <li>Updated {formatRelativeDate(repo.updatedAtMs)}</li>
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );

export const ProfilePage = () => {
  const { owner = "" } = useParams();
  const repos = useApiData(() => api.repos(), [owner]);
  const ownerRepos = (repos.data?.repos ?? []).filter((repo) => repo.owner === owner);

  return (
    <AppShell>
      <DataBoundary loading={repos.loading} error={repos.error} onRetry={() => void repos.reload()}>
        <section aria-label={`${owner} profile`} className="grid gap-8 md:grid-cols-[240px_1fr]">
          <aside className="space-y-4">
            <img src="/android-chrome-192x192.png" alt="" width={240} height={240} className="rounded-full border" />
            <div>
              <h1 className="break-all text-xl font-semibold">{owner}</h1>
              <p className="break-all text-sm text-muted-foreground">{owner}</p>
            </div>
            <ul className="text-sm text-muted-foreground">
              <li>
                <strong className="text-foreground">{ownerRepos.length}</strong> repositories
              </li>
            </ul>
          </aside>
          <div className="space-y-8" id="repositories">
            <div className="space-y-3">
              <h2 className="text-base font-semibold">Popular repositories</h2>
              <PopularRepoGrid repos={ownerRepos} emptyMessage={`${owner} does not have visible repositories yet.`} />
            </div>
            <ContributionCalendar repos={ownerRepos} />
            <ContributionActivity repos={ownerRepos} />
          </div>
        </section>
      </DataBoundary>
    </AppShell>
  );
};
