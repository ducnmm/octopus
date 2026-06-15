import type { RepoListItem } from "@ducnmm/octopus-shared";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge.js";
import { Button } from "@/components/ui/button.js";
import { Card, CardContent } from "@/components/ui/card.js";
import { formatRelativeDate, pluralize, repoBasePath } from "@/lib/format.js";

export const RepoMetaList = ({ repo }: { repo: RepoListItem }) => (
  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
    <li>{pluralize(repo.refCount, "branch", "branches")}</li>
    {typeof repo.commitCount === "number" ? <li>{pluralize(repo.commitCount, "commit")}</li> : null}
    <li>Updated {formatRelativeDate(repo.updatedAtMs)}</li>
  </ul>
);

export const RepoCard = ({ repo }: { repo: RepoListItem }) => (
  <Card>
    <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
      <div className="min-w-0 space-y-1">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Link to={repoBasePath(repo)} title={repo.repoId} className="truncate text-primary hover:underline">
            {repo.repoId}
          </Link>
          <Badge variant="outline" className="capitalize">
            {repo.visibility}
          </Badge>
        </h2>
        <RepoMetaList repo={repo} />
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to={repoBasePath(repo)}>View repository</Link>
      </Button>
    </CardContent>
  </Card>
);

export const RepoCardList = ({ repos, emptyMessage }: { repos: RepoListItem[]; emptyMessage: string }) =>
  repos.length === 0 ? (
    <Card>
      <CardContent className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</CardContent>
    </Card>
  ) : (
    <div className="space-y-3">
      {repos.map((repo) => (
        <RepoCard key={repo.repoId} repo={repo} />
      ))}
    </div>
  );
