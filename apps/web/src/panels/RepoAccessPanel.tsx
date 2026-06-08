import { useCallback } from "react";
import { Transaction } from "@mysten/sui/transactions";
import type { LoginParams } from "../login-params.js";
import { useAuthFlow, type AuthAction } from "../hooks/useAuthFlow.js";
import { useDelegateKit } from "../hooks/useDelegateKit.js";
import { finishBrowserFlow } from "../lib/browser-flow.js";
import { waitForDigest } from "../lib/sui.js";
import { executeWalletTransaction } from "../lib/transactions.js";
import { AuthCard } from "../components/AuthCard.js";
import { DetailRow } from "../components/DetailRow.js";

export function RepoAccessPanel({ params }: { params: LoginParams }) {
  const kit = useDelegateKit();

  const accessLabel = params.action === "remove" ? "Remove contributor" : "Add contributor";
  const normalizedRole = params.role === "reader" ? "reader" : "writer";
  const normalizedAction = params.action === "remove" ? "remove" : "add";

  const executeAccessChange = useCallback<AuthAction>(
    async ({ account, setState, setMessage }) => {
      if (!params.server || !params.packageId || !params.repoObjectId || !params.walletAddress) {
        setState("error");
        setMessage("Missing repository access transaction parameters.");
        return;
      }

      if (params.ownerWallet && account.address.toLowerCase() !== params.ownerWallet.toLowerCase()) {
        setState("error");
        setMessage("Connect the repository owner wallet to manage contributors.");
        return;
      }

      setState("working");
      setMessage("Preparing contributor transaction...");

      const functionName =
        normalizedAction === "remove"
          ? normalizedRole === "reader"
            ? "remove_reader"
            : "remove_member"
          : normalizedRole === "reader"
            ? "add_reader"
            : "add_member";
      const tx = new Transaction();
      tx.setSender(account.address);
      tx.moveCall({
        target: `${params.packageId}::registry::${functionName}`,
        arguments: [tx.object(params.repoObjectId), tx.pure.address(params.walletAddress)]
      });

      setMessage("Approve the contributor change in your wallet.");
      const result = await executeWalletTransaction(
        { kit, params, address: account.address, setMessage },
        tx,
        {
          allowedAddresses: [account.address, params.repoObjectId, params.walletAddress],
          allowedMoveCallTargets: [`${params.packageId}::registry::${functionName}`]
        }
      );

      setMessage("Waiting for Sui confirmation...");
      await waitForDigest(result.digest);

      setState("success");
      setMessage("Contributor access updated.");
      finishBrowserFlow(params, params.returnTo || `/${params.owner}/${params.repo}/settings/access`);
    },
    [kit, normalizedAction, normalizedRole, params]
  );

  const flow = useAuthFlow(params, executeAccessChange, { autoStart: params.autoStart });

  return (
    <AuthCard
      title={accessLabel}
      ariaLabel="Octopus repository access"
      actionLabel={accessLabel}
      busyLabel="Updating"
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
          <DetailRow label="Contributor" fallback="Missing" value={params.walletAddress} />
          <DetailRow label="Role" fallback="Writer" value={normalizedRole} />
        </>
      }
    />
  );
}
