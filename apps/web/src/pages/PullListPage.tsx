import type { PullRequestStatusFilter } from "@ducnmm/octopus-shared";
import { Link, useParams, useSearchParams } from "react-router";
import { GitPullRequest } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell.js";
import { DataBoundary } from "@/components/layout/DataBoundary.js";
import { PullStatusBadge } from "@/components/pulls/PullStatusBadge.js";
import { RepoHeader } from "@/components/repo/RepoHeader.js";
import { Button } from "@/components/ui/button.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.js";
import { useApiData } from "@/hooks/useApiData.js";
import { useViewer } from "@/hooks/useViewer.js";
import { actorDisplayForWallet, formatDate, formatRelativeDate, repoBasePath, shortRef, shortWallet } from "@/lib/format.js";
import { api } from "@/lib/octopus-api.js";
import { canWritePullRequests, pullRequestHref } from "@/lib/pull-utils.js";

const STATUSES = ["open", "closed", "merged", "all"] as const;

const parseStatus = (value: string | null): PullRequestStatusFilter =>
  value === "open" || value === "closed" || value === "merged" || value === "all" ? value : "open";

export const PullListPage = () => {
  const { owner = "", repo: repoName = "" } = useParams();
  const [searchParams] = useSearchParams();
  const status = parseStatus(searchParams.get("status"));
  const { viewer } = useViewer();

  const page = useApiData(async () => {
    const [{ repo }, { pullRequests: allPullRequests }] = await Promise.all([
      api.repo(owner, repoName),
      api.pulls(owner, repoName, "all")
    ]);
    return { repo, allPullRequests };
  }, [owner, repoName]);

  const allPullRequests = page.data?.allPullRequests ?? [];
  const pullRequests = status === "all" ? allPullRequests : allPullRequests.filter((pull) => pull.status === status);
  const counts = Object.fromEntries(
    STATUSES.map((key) => [key, key === "all" ? allPullRequests.length : allPullRequests.filter((p) => p.status === key).length])
  ) as Record<(typeof STATUSES)[number], number>;

  return (
    <AppShell>
      <DataBoundary
        loading={page.loading}
        error={page.error}
        owner={owner}
        repo={repoName}
        onRetry={() => void page.reload()}
      >
        {page.data ? (
          <div className="space-y-4">
            <RepoHeader repo={page.data.repo} subtitle="Pull requests" active="pulls" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <nav className="flex gap-1" aria-label="Filter pull requests">
                {STATUSES.map((key) => (
                  <Link
                    key={key}
                    to={`${repoBasePath(page.data!.repo)}/pulls?status=${key}`}
                    className={`rounded-full px-3 py-1 text-sm ${
                      key === status ? "bg-accent font-semibold" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {counts[key]} {key}
                  </Link>
                ))}
              </nav>
              {canWritePullRequests(page.data.repo, viewer) ? (
                <Button asChild size="sm">
                  <Link to={`${repoBasePath(page.data.repo)}/pulls/new`}>
                    <GitPullRequest className="size-4" aria-hidden />
                    New pull request
                  </Link>
                </Button>
              ) : null}
            </div>

            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Author</TableHead>
                    <TableHead>Head</TableHead>
                    <TableHead className="text-right">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pullRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        No pull requests yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pullRequests.map((pull) => {
                      const author = actorDisplayForWallet(page.data!.repo, pull.authorWalletAddress) ?? {
                        label: shortWallet(pull.authorWalletAddress),
                        title: pull.authorWalletAddress
                      };
                      return (
                        <TableRow key={pull.number}>
                          <TableCell>
                            <PullStatusBadge status={pull.status} />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Link
                                to={pullRequestHref(page.data!.repo, pull)}
                                className="font-medium text-primary hover:underline"
                              >
                                {pull.title}
                              </Link>
                              <span className="text-muted-foreground">#{pull.number}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {shortRef(pull.headRef)} into {shortRef(pull.baseRef)}
                            </div>
                          </TableCell>
                          <TableCell title={author.title}>{author.label}</TableCell>
                          <TableCell>
                            <code title={pull.headCommit} className="font-mono text-xs">
                              {pull.headCommit.slice(0, 8)}
                            </code>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground" title={formatDate(pull.updatedAtMs)}>
                            {formatRelativeDate(pull.updatedAtMs)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}
      </DataBoundary>
    </AppShell>
  );
};
