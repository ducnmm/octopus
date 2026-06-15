import { useState, type SubmitEvent } from "react";
import type { RepoListItem } from "@ducnmm/octopus-shared";
import { useParams } from "react-router";
import { AppShell } from "@/components/layout/AppShell.js";
import { DataBoundary } from "@/components/layout/DataBoundary.js";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { Button } from "@/components/ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.js";
import { Input } from "@/components/ui/input.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.js";
import { RepoHeader } from "@/components/repo/RepoHeader.js";
import { useApiData } from "@/hooks/useApiData.js";
import { useViewer } from "@/hooks/useViewer.js";
import { repoBasePath, shortWallet } from "@/lib/format.js";
import { api, apiOrigin, apiUrl } from "@/lib/octopus-api.js";
import { canManageRepoAccess } from "@/lib/repo-utils.js";

type AccessRole = "reader" | "writer";
type AccessAction = "add" | "remove";

/** Testnet repos manage access through the wallet flow at /login?mode=access. */
const repoUsesWalletAccess = (repo: RepoListItem): boolean => !repo.repoObjectId.startsWith("local:");

const walletAccessUrl = (
  repo: RepoListItem,
  input: { action: AccessAction; role?: AccessRole; walletAddress?: string }
): string => {
  const params = new URLSearchParams({
    mode: "access",
    autostart: "1",
    server: apiOrigin,
    owner: repo.owner,
    ownerWallet: repo.ownerWallet,
    repo: repo.name,
    repoObjectId: repo.repoObjectId,
    action: input.action,
    returnTo: apiUrl(`${repoBasePath(repo)}/settings/access`)
  });
  if (input.role) {
    params.set("role", input.role);
  }
  if (input.walletAddress) {
    params.set("walletAddress", input.walletAddress);
  }
  return `/login?${params.toString()}`;
};

const ContributorPanel = ({ repo, reload }: { repo: RepoListItem; reload: () => void }) => {
  const [walletAddress, setWalletAddress] = useState("");
  const [role, setRole] = useState<AccessRole>("writer");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const walletAccess = repoUsesWalletAccess(repo);

  const writers = new Set(repo.writers.map((wallet) => wallet.toLowerCase()));
  const readers = repo.readers.map((wallet) => wallet.toLowerCase()).filter((wallet) => !writers.has(wallet));
  const entries = [
    ...[...writers].sort().map((wallet) => ({ walletAddress: wallet, role: "writer" as const, label: "Writer" })),
    ...readers.sort().map((wallet) => ({ walletAddress: wallet, role: "reader" as const, label: "Reader" }))
  ];

  const update = async (input: { walletAddress: string; role: AccessRole; action: AccessAction }) => {
    if (walletAccess) {
      window.location.assign(walletAccessUrl(repo, input));
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.updateContributor(repo.owner, repo.name, input);
      setWalletAddress("");
      reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPending(false);
    }
  };

  const submitAdd = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    void update({ walletAddress: walletAddress.trim(), role, action: "add" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Contributors</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="flex flex-wrap items-center gap-2" onSubmit={submitAdd}>
          <Input
            name="walletAddress"
            value={walletAddress}
            onChange={(event) => setWalletAddress(event.target.value)}
            placeholder="0x wallet address"
            autoComplete="off"
            required
            className="max-w-sm font-mono text-xs"
          />
          <Select value={role} onValueChange={(value) => setRole(value as AccessRole)}>
            <SelectTrigger className="w-28" aria-label="Contributor role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="writer">Writer</SelectItem>
              <SelectItem value="reader">Reader</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" disabled={pending || walletAddress.trim().length === 0}>
            Add
          </Button>
        </form>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contributors added yet.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {entries.map((entry) => (
              <div key={entry.walletAddress} className="flex items-center justify-between gap-2 px-3 py-2">
                <span title={entry.walletAddress} className="font-mono text-xs">
                  {shortWallet(entry.walletAddress)}
                </span>
                <span className="text-sm text-muted-foreground">{entry.label}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    void update({ walletAddress: entry.walletAddress, role: entry.role, action: "remove" })
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export const AccessSettingsPage = () => {
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
            <RepoHeader repo={repo} subtitle="Manage repository access" active="settings" />
            {canManageRepoAccess(repo, viewer) ? (
              <ContributorPanel repo={repo} reload={() => void page.reload()} />
            ) : (
              <Alert>
                <AlertDescription>Only the repository owner can manage contributors.</AlertDescription>
              </Alert>
            )}
          </div>
        ) : null}
      </DataBoundary>
    </AppShell>
  );
};
