import { useCallback } from "react";
import type { LoginParams } from "../login-params.js";
import { useAuthFlow, type AuthAction } from "../hooks/useAuthFlow.js";
import { useDelegateKit } from "../hooks/useDelegateKit.js";
import { serverUrl, type WebSessionChallenge, type WebSessionResponse } from "../lib/api.js";
import { finishBrowserFlow } from "../lib/browser-flow.js";
import { AuthCard } from "../components/AuthCard.js";
import { DetailRow } from "../components/DetailRow.js";

export function UnlockRepoPanel({ params }: { params: LoginParams }) {
  const kit = useDelegateKit();

  const unlock = useCallback<AuthAction>(
    async ({ setState, setMessage }) => {
      if (!params.server || !params.owner || !params.repo) {
        setState("error");
        setMessage("Missing repository unlock parameters.");
        return;
      }

      setState("working");
      setMessage("Preparing repository unlock...");

      const repoPath = `/v1/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}`;
      const challengeUrl = new URL(serverUrl(params, `${repoPath}/unlock/challenge`));
      challengeUrl.searchParams.set("returnTo", params.returnTo || `/${params.owner}/${params.repo}`);
      const challengeResponse = await fetch(challengeUrl, { credentials: "include" });
      const challenge = (await challengeResponse.json()) as WebSessionChallenge & {
        error?: string;
        unlocked?: boolean;
        repoId?: string;
      };
      if (challenge.unlocked) {
        finishBrowserFlow(params, params.returnTo || `/${params.owner}/${params.repo}`);
        return;
      }
      if (!challengeResponse.ok || !challenge.nonce || !challenge.message) {
        throw new Error(challenge.error ?? `Unlock challenge failed: HTTP ${challengeResponse.status}`);
      }

      setMessage("Sign the repository unlock message in your wallet.");
      const signed = await kit.signPersonalMessage({ message: new TextEncoder().encode(challenge.message) });

      setMessage("Unlocking repository...");
      const unlockResponse = await fetch(serverUrl(params, `${repoPath}/unlock`), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nonce: challenge.nonce, signature: signed.signature })
      });
      const result = (await unlockResponse.json()) as WebSessionResponse & { repoId?: string };
      if (!unlockResponse.ok || !result.ok) {
        throw new Error(result.error ?? `Repository unlock failed: HTTP ${unlockResponse.status}`);
      }

      setState("success");
      setMessage("Repository unlocked.");
      finishBrowserFlow(params, result.returnTo ?? params.returnTo ?? `/${params.owner}/${params.repo}`);
    },
    [kit, params]
  );

  const flow = useAuthFlow(params, unlock, { autoStart: params.autoStart });

  return (
    <AuthCard
      title="Unlock repository"
      ariaLabel="Octopus repository unlock"
      actionLabel="Unlock"
      busyLabel="Unlocking"
      busy={flow.busy}
      disabled={!flow.account?.address || flow.busy}
      onAction={flow.start}
      state={flow.state}
      message={flow.message}
      details={
        <>
          <DetailRow label="Wallet" fallback="Not connected" value={flow.account?.address} />
          <DetailRow
            label="Repo"
            fallback="Missing"
            value={params.owner && params.repo ? `${params.owner}/${params.repo}` : ""}
          />
          <DetailRow label="Server" fallback="Missing" value={params.server} />
        </>
      }
    />
  );
}
