import { useCallback, useMemo, useState } from "react";
import { DAppKitProvider, useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { Transaction } from "@mysten/sui/transactions";
import { dAppKit } from "./dapp-kit.js";
import { runtimeConfig, suiClient } from "./config.js";
import "./styles.css";

type LoginState = "idle" | "working" | "success" | "error";

type LoginParams = {
  callback: string;
  server: string;
  delegatePublicKey: string;
  delegateAddress: string;
  state: string;
  packageId: string;
  accountRegistryId: string;
  repoRegistryId: string;
  serverDelegatePublicKey: string;
  serverDelegateAddress: string;
};

const queryParams = (): LoginParams => {
  const params = new URLSearchParams(window.location.search);
  return {
    callback: params.get("callback") ?? "",
    server: params.get("server") ?? "",
    delegatePublicKey: params.get("delegatePublicKey") ?? "",
    delegateAddress: params.get("delegateAddress") ?? "",
    state: params.get("state") ?? "",
    packageId: params.get("packageId") ?? runtimeConfig.packageId,
    accountRegistryId: params.get("accountRegistryId") ?? runtimeConfig.accountRegistryId,
    repoRegistryId: params.get("repoRegistryId") ?? runtimeConfig.repoRegistryId,
    serverDelegatePublicKey: params.get("serverDelegatePublicKey") ?? "",
    serverDelegateAddress: params.get("serverDelegateAddress") ?? ""
  };
};

const hexToBytes = (hex: string): number[] => {
  const clean = hex.replace(/^0x/, "");
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(Number.parseInt(clean.slice(i, i + 2), 16));
  }

  return bytes;
};

const resolveAccountId = async (accountRegistryId: string, ownerAddress: string): Promise<string | null> => {
  const registry = await suiClient.getObject({
    id: accountRegistryId,
    options: { showContent: true }
  });
  const fields = (registry.data?.content as {
    fields?: { accounts?: { fields?: { id?: { id?: string } } } };
  } | undefined)?.fields;
  const accountsTableId = fields?.accounts?.fields?.id?.id;
  if (!accountsTableId) {
    return null;
  }

  try {
    const entry = await suiClient.getDynamicFieldObject({
      parentId: accountsTableId,
      name: { type: "address", value: ownerAddress }
    });
    return (entry.data?.content as { fields?: { value?: string } } | undefined)?.fields?.value ?? null;
  } catch {
    return null;
  }
};

const callbackCli = async (params: LoginParams, body: {
  walletAddress: string;
  accountId: string;
}): Promise<void> => {
  const response = await fetch(params.callback, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      walletAddress: body.walletAddress,
      accountId: body.accountId,
      state: params.state,
      serverUrl: params.server,
      webUrl: window.location.origin,
      packageId: params.packageId || undefined,
      accountRegistryId: params.accountRegistryId || undefined,
      repoRegistryId: params.repoRegistryId || undefined
    })
  });

  if (!response.ok) {
    throw new Error(`CLI callback failed: HTTP ${response.status}`);
  }
};

function LoginPanel() {
  const account = useCurrentAccount();
  const kit = useDAppKit();
  const params = useMemo(queryParams, []);
  const [state, setState] = useState<LoginState>("idle");
  const [message, setMessage] = useState("");

  const execute = useCallback(async (tx: Transaction): Promise<void> => {
    tx.setSender(account!.address);
    const result = await (kit as unknown as {
      signAndExecuteTransaction: (input: { transaction: Transaction }) => Promise<unknown>;
    }).signAndExecuteTransaction({ transaction: tx });
    if (!result) {
      throw new Error("Wallet did not return a transaction result");
    }
  }, [account, kit]);

  const createAccount = useCallback(async (): Promise<string> => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${params.packageId}::account::create_account`,
      arguments: [tx.object(params.accountRegistryId)]
    });
    await execute(tx);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      const accountId = await resolveAccountId(params.accountRegistryId, account!.address);
      if (accountId) {
        return accountId;
      }
    }

    throw new Error("Created account, but could not resolve account object ID yet");
  }, [account, execute, params.accountRegistryId, params.packageId]);

  const addDelegateKey = useCallback(async (
    accountId: string,
    publicKey: string,
    delegateAddress: string,
    label: string
  ): Promise<void> => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${params.packageId}::account::add_delegate_key`,
      arguments: [
        tx.object(accountId),
        tx.object(params.accountRegistryId),
        tx.pure.vector("u8", hexToBytes(publicKey)),
        tx.pure.address(delegateAddress),
        tx.pure.string(label)
      ]
    });
    await execute(tx);
  }, [execute, params.accountRegistryId, params.packageId]);

  const addDelegateKeyIfNeeded = useCallback(async (
    accountId: string,
    publicKey: string,
    delegateAddress: string,
    label: string
  ): Promise<void> => {
    try {
      await addDelegateKey(accountId, publicKey, delegateAddress, label);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (text.includes("EDelegateKeyAlreadyExists") || text.includes("101")) {
        return;
      }
      throw error;
    }
  }, [addDelegateKey]);

  const approve = useCallback(async () => {
    if (!account?.address) {
      setMessage("Connect a Sui wallet first.");
      return;
    }

    if (!params.callback || !params.delegatePublicKey || !params.delegateAddress || !params.state) {
      setState("error");
      setMessage("Missing CLI callback or delegate key parameters.");
      return;
    }

    setState("working");
    setMessage("Authorizing delegate key...");

    try {
      let accountId: string | null = null;
      if (params.packageId && params.accountRegistryId) {
        accountId = await resolveAccountId(params.accountRegistryId, account.address);
        if (!accountId) {
          setMessage("Creating Octopus account...");
          accountId = await createAccount();
        }

        setMessage("Registering delegate key on Sui...");
        await addDelegateKeyIfNeeded(accountId, params.delegatePublicKey, params.delegateAddress, "octopus-cli");
        if (
          params.serverDelegatePublicKey &&
          params.serverDelegateAddress &&
          params.serverDelegateAddress !== params.delegateAddress
        ) {
          setMessage("Registering server relay delegate on Sui...");
          await addDelegateKeyIfNeeded(
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
        const body = await response.json() as { accountId?: string; error?: string };
        if (!response.ok || !body.accountId) {
          throw new Error(body.error ?? "Local delegate registration failed");
        }
        accountId = body.accountId;
      }

      setMessage("Saving CLI credentials...");
      await callbackCli(params, { walletAddress: account.address, accountId });
      setState("success");
      setMessage("Login complete. You can return to the terminal.");
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setState("error");
      setMessage(text);
    }
  }, [account, addDelegateKeyIfNeeded, createAccount, params]);

  return (
    <main className="shell">
      <section className="panel">
        <div>
          <p className="eyebrow">Octopus Testnet Auth</p>
          <h1>Authorize CLI Delegate</h1>
        </div>
        <div className="grid">
          <div>
            <span>Wallet</span>
            <strong>{account?.address ?? "Not connected"}</strong>
          </div>
          <div>
            <span>Delegate</span>
            <strong>{params.delegateAddress || "Missing"}</strong>
          </div>
          <div>
            <span>Relay</span>
            <strong>{params.serverDelegateAddress || "Local"}</strong>
          </div>
          <div>
            <span>Server</span>
            <strong>{params.server || "Missing"}</strong>
          </div>
        </div>
        <div className="actions">
          <ConnectButton />
          <button disabled={!account?.address || state === "working"} onClick={() => void approve()}>
            {state === "working" ? "Authorizing" : "Authorize"}
          </button>
        </div>
        {message && <p className={`status ${state}`}>{message}</p>}
      </section>
    </main>
  );
}

export function App() {
  return (
    <DAppKitProvider dAppKit={dAppKit}>
      <LoginPanel />
    </DAppKitProvider>
  );
}
