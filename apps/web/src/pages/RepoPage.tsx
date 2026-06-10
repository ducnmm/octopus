import { Link, useParams, useSearchParams } from "react-router";
import { AppShell } from "@/components/layout/AppShell.js";
import { DataBoundary } from "@/components/layout/DataBoundary.js";
import { CloneBox } from "@/components/repo/CloneBox.js";
import { FileBrowser } from "@/components/repo/FileBrowser.js";
import { ReadmePanel } from "@/components/repo/ReadmePanel.js";
import { RefSelector } from "@/components/repo/RefSelector.js";
import { RepoHeader } from "@/components/repo/RepoHeader.js";
import { SetupGuide } from "@/components/repo/SetupGuide.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.js";
import { useApiData } from "@/hooks/useApiData.js";
import { useRepo } from "@/hooks/useRepo.js";
import { pluralize, repoBasePath, shortRef } from "@/lib/format.js";
import { api, apiOrigin } from "@/lib/octopus-api.js";
import { commitCountForRef, findReadmeEntry, hrefWithQuery } from "@/lib/repo-utils.js";

const Breadcrumbs = ({ owner, repoName, refName, path }: { owner: string; repoName: string; refName: string; path: string }) => {
  if (!path) {
    return null;
  }
  const base = `/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/tree`;
  const parts = path.split("/");
  let current = "";

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground" aria-label="Path breadcrumbs">
      <Link to={hrefWithQuery(base, { ref: refName })} className="text-primary hover:underline">
        root
      </Link>
      {parts.map((part) => {
        current = current ? `${current}/${part}` : part;
        return (
          <span key={current} className="flex items-center gap-1">
            <span>/</span>
            <Link to={hrefWithQuery(base, { ref: refName, path: current })} className="text-primary hover:underline">
              {part}
            </Link>
          </span>
        );
      })}
    </nav>
  );
};

const AboutPanel = () => (
  <Card aria-label="Repository about">
    <CardHeader>
      <CardTitle className="text-base">About</CardTitle>
    </CardHeader>
    <CardContent className="text-sm text-muted-foreground">
      No description, website, or topics provided.
    </CardContent>
  </Card>
);

const RepoPageContent = ({
  owner,
  repoName,
  refName,
  path
}: {
  owner: string;
  repoName: string;
  refName: string | undefined;
  path: string;
}) => {
  const { state } = useRepo();
  const repo = state.data?.repo ?? null;
  const resolvedRef = refName ?? (repo ? shortRef(repo.defaultBranch) : undefined);

  const page = useApiData(async () => {
    const [{ index }, { entries }, { commits }, actors] = await Promise.all([
      api.repoIndex(owner, repoName),
      api.tree(owner, repoName, { ref: refName, path }),
      api.commits(owner, repoName, { ref: refName, limit: 25 }),
      api.commitActors(owner, repoName).catch(() => ({ commitActors: {} }))
    ]);
    const readmeEntry = path === "" ? findReadmeEntry(entries) : undefined;
    const readme = readmeEntry
      ? await api
          .blob(owner, repoName, { ref: refName, path: readmeEntry.path })
          .then((result) => result.file)
          .catch(() => null)
      : null;
    return { index, entries, commits, commitActors: actors.commitActors, readme };
  }, [owner, repoName, refName, path]);

  const loading = state.loading || page.loading;
  const error = state.error ?? page.error;

  return (
    <DataBoundary
      loading={loading}
      error={error}
      owner={owner}
      repo={repoName}
      onRetry={() => {
        void state.reload();
        void page.reload();
      }}
    >
      {repo && page.data && resolvedRef ? (
        <div className="space-y-4">
          <RepoHeader repo={repo} subtitle={`Repository ${repo.repoId} on ${shortRef(resolvedRef)}`} active="code" />
          <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <RefSelector repo={repo} refName={resolvedRef} target={{ view: "tree", path }} />
                  <span className="text-sm text-muted-foreground">
                    {pluralize(repo.refCount, "branch", "branches")}
                  </span>
                  <Breadcrumbs owner={owner} repoName={repoName} refName={resolvedRef} path={path} />
                </div>
                <CloneBox cloneCommand={`git clone ${apiOrigin}${repo.gitRemotePath}`} />
              </div>

              {page.data.index.treeTruncated ? (
                <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  File index is truncated at {page.data.index.treeEntryCount} entries. Increase
                  OCTOPUS_INDEX_TREE_LIMIT for larger repositories.
                </p>
              ) : null}

              {page.data.commits.length === 0 && path === "" ? (
                <SetupGuide remoteUrl={`${apiOrigin}${repo.gitRemotePath}`} />
              ) : (
                <FileBrowser
                  repo={repo}
                  refName={resolvedRef}
                  entries={page.data.entries}
                  commits={page.data.commits}
                  commitCount={commitCountForRef(page.data.index, resolvedRef, page.data.commits)}
                  commitActors={page.data.commitActors}
                />
              )}

              <ReadmePanel readme={page.data.readme} />
            </div>
            <AboutPanel />
          </div>
        </div>
      ) : null}
    </DataBoundary>
  );
};

/** Repo home and /tree views: file browser at a ref/path with README preview. */
export const RepoPage = () => {
  const { owner = "", repo: repoName = "" } = useParams();
  const [searchParams] = useSearchParams();
  const refName = searchParams.get("ref") ?? undefined;
  const path = searchParams.get("path") ?? "";

  return (
    <AppShell>
      <RepoPageContent
        key={`${repoBasePath({ owner, name: repoName })}|${refName ?? ""}|${path}`}
        owner={owner}
        repoName={repoName}
        refName={refName}
        path={path}
      />
    </AppShell>
  );
};
