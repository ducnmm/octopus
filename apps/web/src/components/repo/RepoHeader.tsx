import type { RepoListItem } from "@ducnmm/octopus-shared";
import { Link } from "react-router";
import { Activity, Code, GitCommitHorizontal, GitPullRequest, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge.js";
import { useViewer } from "@/hooks/useViewer.js";
import { repoBasePath } from "@/lib/format.js";
import { canManageRepoAccess } from "@/lib/repo-utils.js";

export type RepoHeaderView = "code" | "pulls" | "commits" | "activity" | "settings";

const RepoNav = ({ repo, active }: { repo: RepoListItem; active: RepoHeaderView }) => {
  const { viewer } = useViewer();
  const base = repoBasePath(repo);
  const links: Array<{ view: RepoHeaderView; href: string; icon: typeof Code; label: string; count?: number }> = [
    { view: "code", href: base, icon: Code, label: "Code" },
    { view: "pulls", href: `${base}/pulls`, icon: GitPullRequest, label: "Pull requests", count: repo.pullRequestCount },
    { view: "commits", href: `${base}/commits`, icon: GitCommitHorizontal, label: "Commits", count: repo.commitCount },
    { view: "activity", href: `${base}/activity`, icon: Activity, label: "Activity", count: repo.activityCount }
  ];
  if (canManageRepoAccess(repo, viewer)) {
    links.push({ view: "settings", href: `${base}/settings/access`, icon: Settings, label: "Settings" });
  }

  return (
    <nav aria-label="Repository navigation" className="flex flex-wrap gap-1 border-b">
      {links.map((link) => {
        const Icon = link.icon;
        const isActive = link.view === active;
        return (
          <Link
            key={link.view}
            to={link.href}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${
              isActive
                ? "border-primary font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="size-4" aria-hidden />
            <span>{link.label}</span>
            {typeof link.count === "number" ? (
              <Badge variant="secondary" aria-label={`${link.count} ${link.label}`}>
                {link.count}
              </Badge>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
};

export const RepoHeader = ({
  repo,
  subtitle,
  active = "code"
}: {
  repo: RepoListItem;
  subtitle: string;
  active?: RepoHeaderView;
}) => (
  <header className="space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h1 className="flex flex-wrap items-center gap-1 text-xl font-semibold">
          <Link to={`/${encodeURIComponent(repo.owner)}`} className="break-all text-primary hover:underline">
            {repo.owner}
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link to={repoBasePath(repo)} className="break-all text-primary hover:underline">
            {repo.name}
          </Link>
        </h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <Badge variant="outline" className="capitalize">
        {repo.visibility}
      </Badge>
    </div>
    <RepoNav repo={repo} active={active} />
  </header>
);
