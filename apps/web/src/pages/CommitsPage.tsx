import { useParams, useSearchParams } from "react-router";
import { AppShell } from "@/components/layout/AppShell.js";
import { DataBoundary } from "@/components/layout/DataBoundary.js";
import { RefSelector } from "@/components/repo/RefSelector.js";
import { RepoHeader } from "@/components/repo/RepoHeader.js";
import { Badge } from "@/components/ui/badge.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.js";
import { useApiData } from "@/hooks/useApiData.js";
import { formatRelativeDate, pluralize, shortRef } from "@/lib/format.js";
import { api } from "@/lib/octopus-api.js";
import { commitActorDisplay, commitCountForRef } from "@/lib/repo-utils.js";

export const CommitsPage = () => {
  const { owner = "", repo: repoName = "" } = useParams();
  const [searchParams] = useSearchParams();
  const refName = searchParams.get("ref") ?? undefined;

  const page = useApiData(async () => {
    const [{ repo }, { index }, commitsResult, actors] = await Promise.all([
      api.repo(owner, repoName),
      api.repoIndex(owner, repoName),
      api.commits(owner, repoName, { ref: refName, limit: 100 }),
      api.commitActors(owner, repoName).catch(() => ({ commitActors: {} }))
    ]);
    return { repo, index, commits: commitsResult.commits, ref: commitsResult.ref, commitActors: actors.commitActors };
  }, [owner, repoName, refName]);

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
            <RepoHeader repo={page.data.repo} subtitle={`Commits on ${shortRef(page.data.ref)}`} active="commits" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <RefSelector repo={page.data.repo} refName={page.data.ref} target={{ view: "commits" }} />
                <span className="text-sm text-muted-foreground">
                  {pluralize(commitCountForRef(page.data.index, page.data.ref, page.data.commits), "commit")}
                </span>
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                Last indexed {formatRelativeDate(page.data.index.indexedAtMs)}
              </span>
            </div>
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SHA</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Author</TableHead>
                    <TableHead className="text-right">Authored</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {page.data.commits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        No commits indexed yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    page.data.commits.map((commit) => {
                      const actor = commitActorDisplay(page.data!.repo, commit, page.data!.commitActors);
                      return (
                        <TableRow key={commit.oid}>
                          <TableCell>
                            <code title={commit.oid} className="font-mono text-xs">
                              {commit.oid.slice(0, 8)}
                            </code>
                          </TableCell>
                          <TableCell>
                            <div title={commit.subject} className="line-clamp-1 font-medium">
                              {commit.subject}
                            </div>
                            {commit.refs?.length ? (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {commit.refs.slice(0, 6).map((ref) => (
                                  <Badge key={ref} variant="outline">
                                    {shortRef(ref)}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell title={actor.title}>
                            <span className="flex items-center gap-1.5">
                              {actor.label}
                              {commit.parents.length > 1 ? <Badge variant="secondary">merge</Badge> : null}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground" title={commit.authoredAt}>
                            {formatRelativeDate(commit.authoredAt)}
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
