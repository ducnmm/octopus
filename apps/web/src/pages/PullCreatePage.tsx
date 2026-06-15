import { useState, type SubmitEvent } from "react";
import type { RepoListItem } from "@ducnmm/octopus-shared";
import { useNavigate, useParams } from "react-router";
import { AppShell } from "@/components/layout/AppShell.js";
import { DataBoundary } from "@/components/layout/DataBoundary.js";
import { RepoHeader } from "@/components/repo/RepoHeader.js";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { Button } from "@/components/ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useApiData } from "@/hooks/useApiData.js";
import { useViewer } from "@/hooks/useViewer.js";
import { shortRef } from "@/lib/format.js";
import { api } from "@/lib/octopus-api.js";
import { canWritePullRequests, pullRequestHref } from "@/lib/pull-utils.js";

const branchNames = (repo: RepoListItem): string[] => {
  const branches = repo.refs.length > 0 ? repo.refs.map((ref) => ref.shortName) : [shortRef(repo.defaultBranch)];
  return [...new Set(branches)];
};

const CreatePullForm = ({ repo }: { repo: RepoListItem }) => {
  const navigate = useNavigate();
  const branches = branchNames(repo);
  const [baseRef, setBaseRef] = useState(shortRef(repo.defaultBranch));
  const [headRef, setHeadRef] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { pullRequest } = await api.createPull(repo.owner, repo.name, {
        title: title.trim(),
        body: body.trim(),
        baseRef,
        headRef
      });
      navigate(pullRequestHref(repo, pullRequest));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Open pull request</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2">
              <Label htmlFor="baseRef">Base</Label>
              <Select value={baseRef} onValueChange={setBaseRef}>
                <SelectTrigger id="baseRef" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch} value={branch}>
                      {branch}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="headRef">Head</Label>
              <Select value={headRef} onValueChange={setHeadRef}>
                <SelectTrigger id="headRef" className="w-48">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch} value={branch}>
                      {branch}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              autoComplete="off"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="body">Description</Label>
            <Textarea id="body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={10000} rows={6} />
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" disabled={submitting || !headRef || title.trim().length === 0}>
            {submitting ? "Opening…" : "Open pull request"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export const PullCreatePage = () => {
  const { owner = "", repo: repoName = "" } = useParams();
  const { viewer } = useViewer();
  const page = useApiData(() => api.repo(owner, repoName), [owner, repoName]);
  const repo = page.data?.repo ?? null;

  return (
    <AppShell>
      <DataBoundary
        loading={page.loading}
        error={page.error}
        owner={owner}
        repo={repoName}
        onRetry={() => void page.reload()}
      >
        {repo ? (
          <div className="space-y-4">
            <RepoHeader repo={repo} subtitle="Open pull request" active="pulls" />
            {canWritePullRequests(repo, viewer) ? (
              <CreatePullForm repo={repo} />
            ) : (
              <Alert>
                <AlertDescription>Write access is required to open a pull request.</AlertDescription>
              </Alert>
            )}
          </div>
        ) : null}
      </DataBoundary>
    </AppShell>
  );
};
