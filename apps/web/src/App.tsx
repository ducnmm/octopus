import { useCallback, useEffect, useMemo, useState } from "react";
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

type DelegateInput = {
  publicKey: string;
  delegateAddress: string;
  label: string;
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

const desiredDelegates = (params: LoginParams): DelegateInput[] => {
  const delegates = [{
    publicKey: params.delegatePublicKey,
    delegateAddress: params.delegateAddress,
    label: "octopus-cli"
  }];
  if (
    params.serverDelegatePublicKey &&
    params.serverDelegateAddress &&
    params.serverDelegateAddress !== params.delegateAddress
  ) {
    delegates.push({
      publicKey: params.serverDelegatePublicKey,
      delegateAddress: params.serverDelegateAddress,
      label: "octopus-server"
    });
  }

  return delegates;
};

const resolveRegisteredDelegates = async (accountId: string): Promise<Set<string>> => {
  const accountObject = await suiClient.getObject({
    id: accountId,
    options: { showContent: true }
  });
  const fields = (accountObject.data?.content as {
    fields?: { delegate_keys?: Array<{ fields?: { sui_address?: string } }> };
  } | undefined)?.fields;

  return new Set(
    (fields?.delegate_keys ?? [])
      .map((delegate) => delegate.fields?.sui_address)
      .filter((address): address is string => Boolean(address))
  );
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
  const [accountId, setAccountId] = useState<string | null>(null);
  const [pendingDelegates, setPendingDelegates] = useState<DelegateInput[] | null>(null);
  const [isResolvingAccount, setIsResolvingAccount] = useState(false);

  const execute = useCallback(async (tx: Transaction): Promise<void> => {
    tx.setSender(account!.address);
    const result = await (kit as unknown as {
      signAndExecuteTransaction: (input: { transaction: Transaction }) => Promise<unknown>;
    }).signAndExecuteTransaction({ transaction: tx });
    if (!result) {
      throw new Error("Wallet did not return a transaction result");
    }
  }, [account, kit]);

  useEffect(() => {
    let cancelled = false;

    const loadAccount = async (): Promise<void> => {
      setAccountId(null);
      setPendingDelegates(null);
      if (!account?.address || !params.packageId || !params.accountRegistryId) {
        return;
      }

      setIsResolvingAccount(true);
      try {
        const resolvedAccountId = await resolveAccountId(params.accountRegistryId, account.address);
        if (!cancelled) {
          setAccountId(resolvedAccountId);
        }
      } catch {
        if (!cancelled) {
          setAccountId(null);
        }
      } finally {
        if (!cancelled) {
          setIsResolvingAccount(false);
        }
      }
    };

    void loadAccount();

    return () => {
      cancelled = true;
    };
  }, [account?.address, params.accountRegistryId, params.packageId]);

  useEffect(() => {
    let cancelled = false;

    const loadDelegates = async (): Promise<void> => {
      setPendingDelegates(null);
      if (!accountId || !params.packageId || !params.accountRegistryId) {
        return;
      }

      setIsResolvingAccount(true);
      try {
        const registeredDelegates = await resolveRegisteredDelegates(accountId);
        if (!cancelled) {
          setPendingDelegates(
            desiredDelegates(params).filter((delegate) => !registeredDelegates.has(delegate.delegateAddress))
          );
        }
      } finally {
        if (!cancelled) {
          setIsResolvingAccount(false);
        }
      }
    };

    void loadDelegates();

    return () => {
      cancelled = true;
    };
  }, [accountId, params]);

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
        setAccountId(accountId);
        return accountId;
      }
    }

    throw new Error("Created account, but could not resolve account object ID yet");
  }, [account, execute, params.accountRegistryId, params.packageId]);

  const addDelegateKeys = useCallback(async (
    accountId: string,
    delegates: DelegateInput[]
  ): Promise<void> => {
    const tx = new Transaction();
    for (const delegate of delegates) {
      tx.moveCall({
        target: `${params.packageId}::account::add_delegate_key`,
        arguments: [
          tx.object(accountId),
          tx.object(params.accountRegistryId),
          tx.pure.vector("u8", hexToBytes(delegate.publicKey)),
          tx.pure.address(delegate.delegateAddress),
          tx.pure.string(delegate.label)
        ]
      });
    }
    await execute(tx);
  }, [execute, params.accountRegistryId, params.packageId]);

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
      let authorizedAccountId: string | null = null;
      if (params.packageId && params.accountRegistryId) {
        authorizedAccountId = accountId;
        if (!authorizedAccountId) {
          setMessage("Creating Octopus account...");
          authorizedAccountId = await createAccount();
          setState("idle");
          setMessage("Account created. Click Authorize again to register delegate keys.");
          return;
        }

        const delegates = pendingDelegates ?? desiredDelegates(params);
        if (delegates.length > 0) {
          setMessage("Registering delegate keys on Sui...");
          await addDelegateKeys(authorizedAccountId, delegates);
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
        authorizedAccountId = body.accountId;
      }

      setMessage("Saving CLI credentials...");
      await callbackCli(params, { walletAddress: account.address, accountId: authorizedAccountId });
      setState("success");
      setMessage("Login complete. You can return to the terminal.");
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setState("error");
      setMessage(text);
    }
  }, [account, accountId, addDelegateKeys, createAccount, params, pendingDelegates]);

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
          <button disabled={!account?.address || isResolvingAccount || state === "working"} onClick={() => void approve()}>
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
