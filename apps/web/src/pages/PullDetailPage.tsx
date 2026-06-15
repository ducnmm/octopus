import { useState, type SubmitEvent } from "react";
import type {
  CommitActorMap,
  PullRequest,
  PullRequestComparison,
  PullRequestMergeability,
  PullRequestMergeStrategy,
  RepoListItem
} from "@ducnmm/octopus-shared";
import { useParams } from "react-router";
import { AppShell } from "@/components/layout/AppShell.js";
import { DataBoundary } from "@/components/layout/DataBoundary.js";
import { PullStatusBadge } from "@/components/pulls/PullStatusBadge.js";
import { RepoHeader } from "@/components/repo/RepoHeader.js";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { Button } from "@/components/ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useApiData } from "@/hooks/useApiData.js";
import { useViewer } from "@/hooks/useViewer.js";
import { actorDisplayForWallet, formatDate, formatRelativeDate, pluralize, shortRef, shortWallet } from "@/lib/format.js";
import { api } from "@/lib/octopus-api.js";
import { canWritePullRequests, isPullRequestAuthor } from "@/lib/pull-utils.js";
import { commitActorDisplay } from "@/lib/repo-utils.js";

const ActionsPanel = ({
  repo,
  pullRequest,
  comparison,
  mergeability,
  reload
}: {
  repo: RepoListItem;
  pullRequest: PullRequest;
  comparison: PullRequestComparison;
  mergeability: PullRequestMergeability | undefined;
  reload: () => void;
}) => {
  const { viewer } = useViewer();
  const [strategy, setStrategy] = useState<PullRequestMergeStrategy>("merge");
  const [deleteBranch, setDeleteBranch] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canMerge = canWritePullRequests(repo, viewer);
  const canTransition = canMerge || isPullRequestAuthor(pullRequest, viewer);

  const run = async (action: () => Promise<unknown>) => {
    setPending(true);
    setError(null);
    try {
      await action();
      reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPending(false);
    }
  };

  const sections: React.ReactNode[] = [];

  if (pullRequest.status === "merged") {
    sections.push(
      <p key="merged" className="text-sm text-muted-foreground">
        Merged{pullRequest.mergeStrategy ? ` (${pullRequest.mergeStrategy})` : ""}
        {pullRequest.mergeCommit ? (
          <>
            {" as "}
            <code title={pullRequest.mergeCommit} className="font-mono text-xs">
              {pullRequest.mergeCommit.slice(0, 8)}
            </code>
          </>
        ) : null}
        .
      </p>
    );
  } else if (pullRequest.status === "open" && mergeability) {
    sections.push(
      mergeability.mergeable ? (
        <p key="mergeable" className="text-sm text-muted-foreground">
          No conflicts with the base branch.
        </p>
      ) : (
        <p key="conflict" className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          {mergeability.reason ?? "This pull request cannot be merged."}
        </p>
      )
    );
  }

  if (pullRequest.status === "open" && canMerge && mergeability?.mergeable) {
    sections.push(
      <div key="merge" className="flex flex-wrap items-center gap-3">
        <Select value={strategy} onValueChange={(value) => setStrategy(value as PullRequestMergeStrategy)}>
          <SelectTrigger className="w-56" aria-label="Merge strategy">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="merge">Create a merge commit</SelectItem>
            <SelectItem value="squash">Squash and merge</SelectItem>
            <SelectItem value="fast-forward">Fast-forward</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={deleteBranch}
            onChange={(event) => setDeleteBranch(event.target.checked)}
          />
          Delete head branch
        </label>
        <Button
          disabled={pending}
          onClick={() =>
            void run(() =>
              api.mergePull(repo.owner, repo.name, pullRequest.number, {
                strategy,
                expectedHeadCommit: comparison.headCommit,
                deleteBranch
              })
            )
          }
        >
          Merge pull request
        </Button>
      </div>
    );
  }

  if (pullRequest.status === "open" && canTransition) {
    sections.push(
      <Button
        key="close"
        variant="outline"
        disabled={pending}
        onClick={() => void run(() => api.closePull(repo.owner, repo.name, pullRequest.number))}
      >
        Close pull request
      </Button>
    );
  }

  if (pullRequest.status === "closed" && canTransition) {
    sections.push(
      <Button
        key="reopen"
        variant="outline"
        disabled={pending}
        onClick={() => void run(() => api.reopenPull(repo.owner, repo.name, pullRequest.number))}
      >
        Reopen pull request
      </Button>
    );
  }

  if (!error && sections.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {sections}
      </CardContent>
    </Card>
  );
};

const CommentsPanel = ({
  repo,
  pullRequest,
  reload
}: {
  repo: RepoListItem;
  pullRequest: PullRequest;
  reload: () => void;
}) => {
  const { viewer } = useViewer();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const comments = [...pullRequest.comments].sort((a, b) => a.createdAtMs - b.createdAtMs || a.id - b.id);
  const canComment = canWritePullRequests(repo, viewer) || isPullRequestAuthor(pullRequest, viewer);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.addPullComment(repo.owner, repo.name, pullRequest.number, body.trim());
      setBody("");
      reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{pluralize(comments.length, "comment")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        ) : (
          <div className="space-y-3">
            {comments.map((comment) => {
              const author = actorDisplayForWallet(repo, comment.authorWalletAddress) ?? {
                label: shortWallet(comment.authorWalletAddress),
                title: comment.authorWalletAddress
              };
              return (
                <article key={comment.id} className="rounded-md border p-3">
                  <div className="mb-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span title={author.title} className="font-medium text-foreground">
                      {author.label}
                    </span>
                    <span title={formatDate(comment.createdAtMs)}>{formatRelativeDate(comment.createdAtMs)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{comment.body}</p>
                </article>
              );
            })}
          </div>
        )}
        {canComment ? (
          <form className="space-y-2" onSubmit={(event) => void submit(event)}>
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={10000}
              placeholder="Leave a comment"
              required
              rows={4}
            />
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" disabled={pending || body.trim().length === 0}>
              Comment
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
};

const ComparisonTables = ({
  repo,
  comparison,
  commitActors
}: {
  repo: RepoListItem;
  comparison: PullRequestComparison;
  commitActors?: CommitActorMap;
}) => (
  <>
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
          {comparison.commits.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                No commits in this comparison.
              </TableCell>
            </TableRow>
          ) : (
            comparison.commits.map((commit) => {
              const actor = commitActorDisplay(repo, commit, commitActors);
              return (
                <TableRow key={commit.oid}>
                  <TableCell>
                    <code title={commit.oid} className="font-mono text-xs">
                      {commit.oid.slice(0, 8)}
                    </code>
                  </TableCell>
                  <TableCell>
                    <span title={commit.subject} className="line-clamp-1 font-medium">
                      {commit.subject}
                    </span>
                  </TableCell>
                  <TableCell title={actor.title}>{actor.label}</TableCell>
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

    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File</TableHead>
            <TableHead>Additions</TableHead>
            <TableHead>Deletions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {comparison.files.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                No file changes in this comparison.
              </TableCell>
            </TableRow>
          ) : (
            comparison.files.map((file) => (
              <TableRow key={file.path}>
                <TableCell title={file.path} className="font-mono text-xs">
                  {file.path}
                </TableCell>
                <TableCell className="text-emerald-600">+{file.additions}</TableCell>
                <TableCell className="text-red-600">
                  -{file.deletions}
                  {file.binary ? " binary" : ""}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  </>
);

export const PullDetailPage = () => {
  const { owner = "", repo: repoName = "", number = "" } = useParams();
  const pullNumber = Number.parseInt(number, 10);

  const page = useApiData(async () => {
    const [{ repo }, detail, actors] = await Promise.all([
      api.repo(owner, repoName),
      api.pull(owner, repoName, pullNumber),
      api.commitActors(owner, repoName).catch(() => ({ commitActors: {} }))
    ]);
    return { repo, ...detail, commitActors: actors.commitActors };
  }, [owner, repoName, pullNumber]);

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
            <RepoHeader
              repo={page.data.repo}
              subtitle={`Pull request #${page.data.pullRequest.number}`}
              active="pulls"
            />

            <Card>
              <CardContent className="space-y-3 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold">{page.data.pullRequest.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      {shortRef(page.data.pullRequest.headRef)} into {shortRef(page.data.pullRequest.baseRef)}
                    </p>
                  </div>
                  <PullStatusBadge status={page.data.pullRequest.status} />
                </div>
                {page.data.pullRequest.body ? (
                  <p className="whitespace-pre-wrap text-sm">{page.data.pullRequest.body}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No description provided.</p>
                )}
              </CardContent>
            </Card>

            <ActionsPanel
              repo={page.data.repo}
              pullRequest={page.data.pullRequest}
              comparison={page.data.comparison}
              mergeability={page.data.mergeability}
              reload={() => void page.reload()}
            />

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <div className="flex gap-4">
                <span>{pluralize(page.data.comparison.commitCount, "commit")}</span>
                <span>{pluralize(page.data.comparison.fileCount, "file")}</span>
                <span>
                  <span className="text-emerald-600">+{page.data.comparison.additions}</span>{" "}
                  <span className="text-red-600">-{page.data.comparison.deletions}</span>
                </span>
              </div>
              <div className="flex items-center gap-2" aria-label="Pull request comparison">
                <span className="rounded-full bg-muted px-3 py-1">
                  base <strong>{shortRef(page.data.pullRequest.baseRef)}</strong>
                </span>
                <span aria-hidden>←</span>
                <span className="rounded-full bg-muted px-3 py-1">
                  compare <strong>{shortRef(page.data.pullRequest.headRef)}</strong>
                </span>
              </div>
            </div>

            <ComparisonTables
              repo={page.data.repo}
              comparison={page.data.comparison}
              commitActors={page.data.commitActors}
            />

            <CommentsPanel
              repo={page.data.repo}
              pullRequest={page.data.pullRequest}
              reload={() => void page.reload()}
            />
          </div>
        ) : null}
      </DataBoundary>
    </AppShell>
  );
};
