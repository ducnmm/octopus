import { useState, type SubmitEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell.js";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { Button } from "@/components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import { useViewer } from "@/hooks/useViewer.js";
import { loginUrl } from "@/lib/auth-redirect.js";
import { api } from "@/lib/octopus-api.js";
import { shortWallet } from "@/lib/format.js";

const SignInGate = () => (
  <Card aria-label="Create repository sign in">
    <CardHeader>
      <CardTitle>Create new repository</CardTitle>
      <CardDescription>Sign in with your Sui wallet before creating a repository.</CardDescription>
    </CardHeader>
    <CardContent>
      <Button asChild>
        <a href={loginUrl("/new")}>Sign in with Sui wallet</a>
      </Button>
    </CardContent>
  </Card>
);

const CreateRepoForm = ({ walletAddress }: { walletAddress: string }) => {
  const navigate = useNavigate();
  const [owner, setOwner] = useState("");
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createRepo({
        owner: owner.trim() || undefined,
        name: name.trim(),
        visibility
      });
      navigate(`/${encodeURIComponent(created.owner)}/${encodeURIComponent(created.name)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setSubmitting(false);
    }
  };

  return (
    <Card aria-label="Create repository form">
      <CardHeader>
        <CardTitle>Create new repository</CardTitle>
        <CardDescription>Start with an empty Git repository owned by your wallet namespace.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-6" onSubmit={(event) => void submit(event)}>
          <div className="flex flex-wrap items-start gap-2">
            <div className="space-y-2">
              <Label htmlFor="owner">Owner namespace</Label>
              <Input
                id="owner"
                name="owner"
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
                maxLength={235}
                autoComplete="off"
                pattern="[A-Za-z0-9._-]+"
                placeholder={shortWallet(walletAddress)}
                className="max-w-56"
              />
              <p className="text-xs text-muted-foreground">Leave blank to use your wallet or primary SuiNS name.</p>
            </div>
            <span className="pt-8 text-muted-foreground" aria-hidden>
              /
            </span>
            <div className="space-y-2">
              <Label htmlFor="name">Repository name</Label>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                autoComplete="off"
                pattern="[A-Za-z0-9._-]+"
                required
                className="max-w-56"
              />
              <p className="text-xs text-muted-foreground">Letters, numbers, dots, underscores, and hyphens.</p>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Visibility</legend>
            {(
              [
                ["public", "Public", "Anyone can find and clone this repository."],
                ["private", "Private", "Only the owner and invited contributors can access it."]
              ] as const
            ).map(([value, title, copy]) => (
              <label key={value} className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                <input
                  type="radio"
                  name="visibility"
                  value={value}
                  checked={visibility === value}
                  onChange={() => setVisibility(value)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block text-xs text-muted-foreground">{copy}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={submitting || name.trim().length === 0}>
              <Plus className="size-4" aria-hidden />
              {submitting ? "Creating…" : "Create repository"}
            </Button>
            <Button asChild variant="outline">
              <Link to="/">Cancel</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export const CreateRepoPage = () => {
  const { viewer } = useViewer();

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-4">
        <header>
          <h1 className="text-2xl font-semibold">New repository</h1>
          <p className="text-sm text-muted-foreground">
            Create a recoverable Git repository backed by Sui and Walrus.
          </p>
        </header>
        {viewer ? <CreateRepoForm walletAddress={viewer.walletAddress} /> : <SignInGate />}
      </div>
    </AppShell>
  );
};
