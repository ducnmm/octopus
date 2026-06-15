import type { CommitActorMap, IndexedCommit, RepoListItem, TreeEntry } from "@ducnmm/octopus-shared";
import { Link } from "react-router";
import { File, Folder } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar.js";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table.js";
import { formatRelativeDate, repoBasePath } from "@/lib/format.js";
import { commitActorDisplay, commitTimestamp, hrefWithQuery, initials } from "@/lib/repo-utils.js";

const entryHref = (repo: RepoListItem, refName: string, entry: TreeEntry): string =>
  hrefWithQuery(`${repoBasePath(repo)}/${entry.type === "tree" ? "tree" : "blob"}`, {
    ref: refName,
    path: entry.path
  });

const SummaryRow = ({
  repo,
  refName,
  commits,
  commitCount,
  commitActors
}: {
  repo: RepoListItem;
  refName: string;
  commits: IndexedCommit[];
  commitCount: number;
  commitActors?: CommitActorMap;
}) => {
  const latestCommit = commits[0];
  const commitsHref = hrefWithQuery(`${repoBasePath(repo)}/commits`, { ref: refName });

  if (!latestCommit) {
    return (
      <TableRow className="bg-muted/50">
        <TableCell colSpan={3}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <Avatar className="size-6">
                <AvatarFallback>OC</AvatarFallback>
              </Avatar>
              <strong>Octopus</strong>
              <Link to={commitsHref} className="text-muted-foreground hover:underline">
                No commits indexed yet
              </Link>
            </div>
            <Link to={commitsHref} className="text-sm text-muted-foreground hover:underline">
              {commitCount} commits
            </Link>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  const actor = commitActorDisplay(repo, latestCommit, commitActors);
  const actorDate = commitTimestamp(latestCommit);
  return (
    <TableRow className="bg-muted/50">
      <TableCell colSpan={3}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <Avatar className="size-6">
              <AvatarFallback>{initials(actor.label)}</AvatarFallback>
            </Avatar>
            <strong title={actor.title} className="shrink-0">
              {actor.label}
            </strong>
            <Link to={commitsHref} title={latestCommit.subject} className="truncate text-muted-foreground hover:underline">
              {latestCommit.subject}
            </Link>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Link to={commitsHref} className="hover:underline">
              <code className="font-mono text-xs">{latestCommit.oid.slice(0, 7)}</code>
            </Link>
            <span title={actorDate}>{formatRelativeDate(actorDate)}</span>
            <Link to={commitsHref} className="hover:underline">
              {commitCount} commits
            </Link>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
};

export const FileBrowser = ({
  repo,
  refName,
  entries,
  commits,
  commitCount,
  commitActors
}: {
  repo: RepoListItem;
  refName: string;
  entries: TreeEntry[];
  commits: IndexedCommit[];
  commitCount: number;
  commitActors?: CommitActorMap;
}) => {
  const latestCommit = commits[0];
  const commitSubject = latestCommit?.subject ?? "No commits indexed yet";
  const commitTime = latestCommit ? formatRelativeDate(commitTimestamp(latestCommit)) : "";

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableBody>
          <SummaryRow
            repo={repo}
            refName={refName}
            commits={commits}
            commitCount={commitCount}
            commitActors={commitActors}
          />
          {entries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                No files in this tree.
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry) => (
              <TableRow key={entry.path}>
                <TableCell className="w-2/5">
                  <Link
                    to={entryHref(repo, refName, entry)}
                    title={entry.path}
                    className="flex items-center gap-2 hover:underline"
                  >
                    {entry.type === "tree" ? (
                      <Folder className="size-4 shrink-0 text-sky-500" aria-hidden />
                    ) : (
                      <File className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <span className="truncate">{entry.type === "tree" ? `${entry.name}/` : entry.name}</span>
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <span title={commitSubject} className="line-clamp-1">
                    {commitSubject}
                  </span>
                </TableCell>
                <TableCell className="w-44 text-right text-muted-foreground">
                  <span title={latestCommit ? commitTimestamp(latestCommit) : ""}>{commitTime}</span>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};
