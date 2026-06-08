import { useCallback } from "react";
import type { LoginParams } from "../login-params.js";
import { useAuthFlow, type AuthAction } from "../hooks/useAuthFlow.js";
import { useDelegateKit } from "../hooks/useDelegateKit.js";
import { callbackCli } from "../lib/api.js";
import { resolveAccountId } from "../lib/sui.js";
import { addDelegateKeyIfNeeded, createAccount, type WalletContext } from "../lib/transactions.js";
import { AuthCard } from "../components/AuthCard.js";
import { DetailRow } from "../components/DetailRow.js";

export function CliLoginPanel({ params }: { params: LoginParams }) {
  const kit = useDelegateKit();

  const approve = useCallback<AuthAction>(
    async ({ account, setState, setMessage }) => {
      if (!params.callback || !params.delegatePublicKey || !params.delegateAddress || !params.state) {
        setState("error");
        setMessage("Missing CLI callback or delegate key parameters.");
        return;
      }

      setState("working");
      setMessage("Authorizing delegate key...");

      const context: WalletContext = { kit, params, address: account.address, setMessage };
      let accountId: string | null = null;
      if (params.packageId && params.accountRegistryId) {
        accountId = await resolveAccountId(params.accountRegistryId, account.address);
        if (!accountId) {
          setMessage("Creating Octopus account...");
          accountId = await createAccount(context);
        }

        setMessage("Registering delegate key on Sui...");
        await addDelegateKeyIfNeeded(context, accountId, params.delegatePublicKey, params.delegateAddress, "octopus-cli");
        if (
          params.serverDelegatePublicKey &&
          params.serverDelegateAddress &&
          params.serverDelegateAddress !== params.delegateAddress
        ) {
          setMessage("Registering server relay delegate on Sui...");
          await addDelegateKeyIfNeeded(
            context,
            accountId,
            params.serverDelegatePublicKey,
            params.serverDelegateAddress,
            "octopus-server"
          );
        }
      } else {
        const response = await fetch(new URL("/v1/auth/delegate", params.server).toString(), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            walletAddress: account.address,
            delegatePublicKey: params.delegatePublicKey,
            delegateAddress: params.delegateAddress
          })
        });
        const body = (await response.json()) as { accountId?: string; error?: string };
        if (!response.ok || !body.accountId) {
          throw new Error(body.error ?? "Local delegate registration failed");
        }
        accountId = body.accountId;
      }

      setMessage("Saving CLI credentials...");
      await callbackCli(params, { walletAddress: account.address, accountId });
      setState("success");
      setMessage("Login complete. You can return to the terminal.");
    },
    [kit, params]
  );

  const flow = useAuthFlow(params, approve);

  return (
    <AuthCard
      title="Authorize CLI Delegate"
      ariaLabel="Octopus authorization"
      actionLabel="Authorize"
      busyLabel="Authorizing"
      busy={flow.busy}
      disabled={!flow.account?.address || flow.busy}
      onAction={flow.start}
      state={flow.state}
      message={flow.message}
      details={
        <>
          <DetailRow label="Wallet" fallback="Not connected" value={flow.account?.address} />
          <DetailRow label="Delegate" fallback="Missing" value={params.delegateAddress} />
          <DetailRow label="Server" fallback="Missing" value={params.server} />
          <DetailRow label="Relay" fallback="Local" value={params.serverDelegateAddress} />
        </>
      }
    />
  );
}
