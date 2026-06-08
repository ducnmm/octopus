import { useCallback } from "react";
import type { LoginParams } from "../login-params.js";
import { useAuthFlow, type AuthAction } from "../hooks/useAuthFlow.js";
import { useDelegateKit } from "../hooks/useDelegateKit.js";
import { serverUrl, type WebSessionChallenge, type WebSessionResponse } from "../lib/api.js";
import { finishBrowserFlow } from "../lib/browser-flow.js";
import { resolveAccountId } from "../lib/sui.js";
import { createAccount, type WalletContext } from "../lib/transactions.js";
import { AuthCard } from "../components/AuthCard.js";
import { DetailRow } from "../components/DetailRow.js";

export function WebLoginPanel({ params }: { params: LoginParams }) {
  const kit = useDelegateKit();

  const signIn = useCallback<AuthAction>(
    async ({ account, setState, setMessage }) => {
      if (!params.server) {
        setState("error");
        setMessage("Missing Octopus server URL.");
        return;
      }

      setState("working");
      setMessage("Checking Octopus account...");

      let accountId: string | null = null;
      if (params.packageId && params.accountRegistryId) {
        try {
          accountId = await resolveAccountId(params.accountRegistryId, account.address);
        } catch {
          accountId = null;
        }

        if (!accountId) {
          setMessage("Creating Octopus account...");
          const context: WalletContext = { kit, params, address: account.address, setMessage };
          accountId = await createAccount(context);
        }
      }

      setMessage("Preparing wallet signature...");
      const challengeUrl = new URL(serverUrl(params, "/v1/auth/web-session/challenge"));
      challengeUrl.searchParams.set("returnTo", params.returnTo || "/");
      const challengeResponse = await fetch(challengeUrl, { credentials: "include" });
      const challenge = (await challengeResponse.json()) as WebSessionChallenge & { error?: string };
      if (!challengeResponse.ok || !challenge.nonce || !challenge.message) {
        throw new Error(challenge.error ?? `Challenge failed: HTTP ${challengeResponse.status}`);
      }

      setMessage("Sign the Octopus login message in your wallet.");
      const signed = await kit.signPersonalMessage({ message: new TextEncoder().encode(challenge.message) });

      setMessage("Starting web session...");
      const sessionResponse = await fetch(serverUrl(params, "/v1/auth/web-session"), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nonce: challenge.nonce,
          walletAddress: account.address,
          accountId: accountId ?? undefined,
          signature: signed.signature
        })
      });
      const session = (await sessionResponse.json()) as WebSessionResponse;
      if (!sessionResponse.ok || !session.ok) {
        throw new Error(session.error ?? `Web session failed: HTTP ${sessionResponse.status}`);
      }

      setState("success");
      setMessage("Login complete.");
      finishBrowserFlow(params, session.returnTo ?? params.returnTo ?? "/");
    },
    [kit, params]
  );

  const flow = useAuthFlow(params, signIn, { autoStart: params.autoStart });

  return (
    <AuthCard
      title="Sign in to Octopus"
      ariaLabel="Octopus web sign in"
      actionLabel="Sign in"
      busyLabel="Signing in"
      busy={flow.busy}
      disabled={!flow.account?.address || flow.busy}
      onAction={flow.start}
      state={flow.state}
      message={flow.message}
      details={
        <>
          <DetailRow label="Wallet" fallback="Not connected" value={flow.account?.address} />
          <DetailRow label="Server" fallback="Missing" value={params.server} />
          <DetailRow label="Return" fallback="/" value={params.returnTo} />
        </>
      }
    />
  );
}
