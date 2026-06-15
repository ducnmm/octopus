import type { RepoActivityItem, RepoListItem } from "@ducnmm/octopus-shared";
import { useParams } from "react-router";
import { AppShell } from "@/components/layout/AppShell.js";
import { DataBoundary } from "@/components/layout/DataBoundary.js";
import { RepoHeader } from "@/components/repo/RepoHeader.js";
import { Card, CardContent, CardHeader } from "@/components/ui/card.js";
import { useApiData } from "@/hooks/useApiData.js";
import { actorDisplayForWallet, formatDate, formatRelativeDate, shortWallet } from "@/lib/format.js";
import { api } from "@/lib/octopus-api.js";

const kindLabel = (kind: RepoActivityItem["kind"]): string => {
  switch (kind) {
    case "access":
      return "A";
    case "pull_request":
      return "PR";
    case "push":
      return "P";
    case "repo":
      return "R";
  }
};

const shortProofValue = (value: string): string => {
  if (/^0x[0-9a-fA-F]+$/.test(value)) {
    return shortWallet(value);
  }
  return value.length > 36 ? `${value.slice(0, 18)}...${value.slice(-10)}` : value;
};

const ActivityItem = ({ repo, item }: { repo: RepoListItem; item: RepoActivityItem }) => {
  const actor = actorDisplayForWallet(repo, item.actorWalletAddress);

  return (
    <article className="flex gap-3 border-b py-4 last:border-b-0">
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold"
      >
        {kindLabel(item.kind)}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-sm font-medium">
          {item.href ? (
            <a href={item.href} className="text-primary hover:underline">
              {item.title}
            </a>
          ) : (
            item.title
          )}
        </div>
        <p title={item.description} className="text-sm text-muted-foreground">
          {item.description}
        </p>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {actor ? <span title={actor.title}>{actor.label}</span> : null}
          <span title={formatDate(item.createdAtMs)}>{formatRelativeDate(item.createdAtMs)}</span>
        </div>
        {item.proof.length > 0 ? (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Proof</summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.proof.map((proof, index) => (
                <span key={index} className="flex items-center gap-1 rounded-full border px-2 py-0.5">
                  <span className="text-muted-foreground">{proof.label}</span>
                  {proof.href ? (
                    <a
                      href={proof.href}
                      target="_blank"
                      rel="noreferrer"
                      title={proof.value}
                      className="font-mono text-primary hover:underline"
                    >
                      {shortProofValue(proof.value)}
                    </a>
                  ) : (
                    <span title={proof.value} className="font-mono">
                      {shortProofValue(proof.value)}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </article>
  );
};

export const ActivityPage = () => {
  const { owner = "", repo: repoName = "" } = useParams();
  const page = useApiData(() => api.activity(owner, repoName), [owner, repoName]);

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
            <RepoHeader repo={page.data.repo} subtitle="Repository activity" active="activity" />
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold">Activity</h2>
                <p className="text-sm text-muted-foreground">
                  Human-readable repository actions with wallet and storage proof when available.
                </p>
              </CardHeader>
              <CardContent>
                {page.data.activity.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No repository activity yet.</p>
                ) : (
                  page.data.activity.map((item) => <ActivityItem key={item.id} repo={page.data!.repo} item={item} />)
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </DataBoundary>
    </AppShell>
  );
};
