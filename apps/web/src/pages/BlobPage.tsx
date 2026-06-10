import { Link, useParams, useSearchParams } from "react-router";
import { Info } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell.js";
import { DataBoundary } from "@/components/layout/DataBoundary.js";
import { ErrorPanel } from "@/components/layout/ErrorPanel.js";
import { RefSelector } from "@/components/repo/RefSelector.js";
import { RepoHeader } from "@/components/repo/RepoHeader.js";
import { Button } from "@/components/ui/button.js";
import { Card, CardContent } from "@/components/ui/card.js";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.js";
import { useApiData } from "@/hooks/useApiData.js";
import { formatDate, shortRef } from "@/lib/format.js";
import { api } from "@/lib/octopus-api.js";
import { hrefWithQuery } from "@/lib/repo-utils.js";

const PathBreadcrumbs = ({
  owner,
  repoName,
  refName,
  path
}: {
  owner: string;
  repoName: string;
  refName: string;
  path: string;
}) => {
  const base = `/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/tree`;
  const parts = path.split("/");
  let current = "";

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground" aria-label="Path breadcrumbs">
      <Link to={hrefWithQuery(base, { ref: refName })} className="text-primary hover:underline">
        root
      </Link>
      {parts.map((part, index) => {
        current = current ? `${current}/${part}` : part;
        const isLast = index === parts.length - 1;
        return (
          <span key={current} className="flex items-center gap-1">
            <span>/</span>
            {isLast ? (
              <span className="text-foreground">{part}</span>
            ) : (
              <Link to={hrefWithQuery(base, { ref: refName, path: current })} className="text-primary hover:underline">
                {part}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
};

export const BlobPage = () => {
  const { owner = "", repo: repoName = "" } = useParams();
  const [searchParams] = useSearchParams();
  const refName = searchParams.get("ref") ?? undefined;
  const path = searchParams.get("path") ?? "";

  const page = useApiData(async () => {
    const [{ repo }, { index }, blobResult, { commits }] = await Promise.all([
      api.repo(owner, repoName),
      api.repoIndex(owner, repoName),
      api.blob(owner, repoName, { ref: refName, path }),
      api.commits(owner, repoName, { ref: refName, limit: 3 })
    ]);
    return { repo, index, file: blobResult.file, ref: blobResult.ref, commits };
  }, [owner, repoName, refName, path]);

  if (!path) {
    return (
      <AppShell>
        <ErrorPanel error={new Error("File path is required")} />
      </AppShell>
    );
  }

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
            <RepoHeader repo={page.data.repo} subtitle={page.data.file.path} active="code" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <RefSelector repo={page.data.repo} refName={page.data.ref} target={{ view: "blob", path }} />
                <PathBreadcrumbs owner={owner} repoName={repoName} refName={page.data.ref} path={page.data.file.path} />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-muted px-3 py-1">{page.data.file.encoding}</span>
                <span className="rounded-full bg-muted px-3 py-1">{page.data.file.size} bytes</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Info className="size-4" aria-hidden />
                      Info
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80 space-y-2 p-3 text-sm">
                    <div>
                      <span className="block text-xs text-muted-foreground">Path</span>
                      <strong title={page.data.file.path} className="break-all">
                        {page.data.file.path}
                      </strong>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="block text-xs text-muted-foreground">Object</span>
                        <code className="font-mono text-xs">{page.data.file.objectId.slice(0, 8)}</code>
                      </div>
                      <div>
                        <span className="block text-xs text-muted-foreground">Size</span>
                        <strong>{page.data.file.size} bytes</strong>
                      </div>
                      <div>
                        <span className="block text-xs text-muted-foreground">Encoding</span>
                        <strong>{page.data.file.encoding}</strong>
                      </div>
                      <div>
                        <span className="block text-xs text-muted-foreground">Branch</span>
                        <strong>{shortRef(page.data.ref)}</strong>
                      </div>
                    </div>
                    <div>
                      <span className="block text-xs text-muted-foreground">Recent commits</span>
                      {page.data.commits.length === 0 ? (
                        <p className="text-muted-foreground">No commits indexed yet.</p>
                      ) : (
                        <ul className="space-y-1">
                          {page.data.commits.slice(0, 3).map((commit) => (
                            <li key={commit.oid} className="truncate">
                              <code className="font-mono text-xs">{commit.oid.slice(0, 8)}</code>{" "}
                              <span title={commit.subject}>{commit.subject}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <span className="block text-xs text-muted-foreground">Last indexed</span>
                      <strong title={formatDate(page.data.index.indexedAtMs)}>
                        {formatDate(page.data.index.indexedAtMs)}
                      </strong>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <Card>
              <CardContent className="py-4">
                {page.data.file.truncated ? (
                  <p className="mb-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    Preview is truncated at the configured blob view limit.
                  </p>
                ) : null}
                {page.data.file.encoding !== "utf8" ? (
                  <p className="mb-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    Binary file preview is base64 encoded.
                  </p>
                ) : null}
                <pre className="overflow-x-auto rounded-md bg-muted/50 p-3 font-mono text-xs leading-5">
                  {page.data.file.content}
                </pre>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </DataBoundary>
    </AppShell>
  );
};
