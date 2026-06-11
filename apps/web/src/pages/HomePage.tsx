import { Link } from "react-router";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge.js";
import { Button } from "@/components/ui/button.js";
import { Card, CardContent } from "@/components/ui/card.js";
import { AppShell } from "@/components/layout/AppShell.js";
import { DataBoundary } from "@/components/layout/DataBoundary.js";
import { Loading } from "@/components/layout/Loading.js";
import { RepoMetaList } from "@/components/repo/RepoCard.js";
import { useApiData } from "@/hooks/useApiData.js";
import { useViewer } from "@/hooks/useViewer.js";
import { loginUrl } from "@/lib/auth-redirect.js";
import { api, apiUrl } from "@/lib/octopus-api.js";
import { formatRelativeDate, repoBasePath } from "@/lib/format.js";

/** Marketing landing for signed-out visitors. */
const LandingPage = () => (
  <main className="relative flex min-h-screen flex-col overflow-hidden bg-[#03060a] text-white">
    <img
      src={apiUrl("/assets/aurora-home.avif?v=octopus-home-v1")}
      alt=""
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-80"
    />
    <img
      src={apiUrl("/assets/octopus-walrus-mascot.png?v=octopus-home-v2")}
      alt=""
      aria-hidden
      className="pointer-events-none absolute bottom-0 right-0 hidden max-h-[70vh] object-contain md:block"
    />
    <header className="relative z-10 flex items-center justify-between px-8 py-6">
      <Link to="/" aria-label="Octopus home" className="text-lg font-bold lowercase tracking-wide">
        octopus
      </Link>
      <a href="/docs" className="text-sm text-white/80 hover:text-white">
        View docs <span aria-hidden>→</span>
      </a>
    </header>
    <section className="relative z-10 flex flex-1 flex-col justify-center gap-6 px-8 pb-24 md:max-w-2xl">
      <h1 className="text-5xl font-bold leading-tight md:text-6xl">
        <span className="block">GitWal</span>
      </h1>
      <p className="max-w-xl text-lg text-white/80">
        Octopus is a Git platform for builders on Sui. Create repositories, manage access, and
        collaborate with cryptographic identity without leaving your Git workflow.
      </p>
      <div>
        <Button asChild size="lg" className="rounded-full">
          <a href={loginUrl("/")}>
            Connect wallet <span aria-hidden>↗</span>
          </a>
        </Button>
      </div>
    </section>
  </main>
);

/** Signed-in home: repository stats and a recent-activity feed. */
const DashboardPage = () => {
  const repos = useApiData(() => api.repos(), []);
  const items = repos.data?.repos ?? [];
  const latestRepos = [...items].sort((left, right) => right.updatedAtMs - left.updatedAtMs);
  const totalCommits = items.reduce((sum, repo) => sum + (repo.commitCount ?? 0), 0);
  const totalBranches = items.reduce((sum, repo) => sum + repo.refCount, 0);
  const feedRepos = latestRepos.slice(0, 6);

  return (
    <AppShell>
      <DataBoundary loading={repos.loading} error={repos.error} onRetry={() => void repos.reload()}>
        <div className="space-y-6">
          <h1 className="text-2xl font-semibold">Home</h1>
          <div className="grid grid-cols-3 gap-3" aria-label="Repository summary">
            {(
              [
                [items.length, items.length === 1 ? "repository" : "repositories"],
                [totalCommits, totalCommits === 1 ? "commit" : "commits"],
                [totalBranches, totalBranches === 1 ? "branch" : "branches"]
              ] as const
            ).map(([count, label]) => (
              <Card key={label}>
                <CardContent className="py-4">
                  <strong className="block text-2xl">{count}</strong>
                  <span className="text-sm text-muted-foreground">{label}</span>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent activity</h2>
            <Button asChild size="sm">
              <Link to="/new">
                <Plus className="size-4" aria-hidden />
                New repository
              </Link>
            </Button>
          </div>

          {feedRepos.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No repositories have been created yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {feedRepos.map((repo) => (
                <Card key={repo.repoId}>
                  <CardContent className="space-y-3 py-4">
                    <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                      <span>
                        <strong className="text-foreground">{repo.owner}</strong> updated a repository
                      </span>
                      <span>{formatRelativeDate(repo.updatedAtMs)}</span>
                    </div>
                    <div className="space-y-2 rounded-md border p-3">
                      <div className="flex items-center gap-2">
                        <Link
                          to={repoBasePath(repo)}
                          title={repo.repoId}
                          className="truncate font-semibold text-primary hover:underline"
                        >
                          {repo.repoId}
                        </Link>
                        <Badge variant="outline" className="capitalize">
                          {repo.visibility}
                        </Badge>
                      </div>
                      <RepoMetaList repo={repo} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DataBoundary>
    </AppShell>
  );
};

export const HomePage = () => {
  const { loading, viewer } = useViewer();
  if (loading) {
    return (
      <AppShell>
        <Loading />
      </AppShell>
    );
  }
  return viewer ? <DashboardPage /> : <LandingPage />;
};
