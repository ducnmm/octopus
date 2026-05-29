import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DAppKitProvider, useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { Transaction } from "@mysten/sui/transactions";
import { dAppKit } from "./dapp-kit.js";
import { runtimeConfig, suiClient } from "./config.js";
import {
  authPanelMode,
  browserFlowTarget,
  loginParamsFromSearch,
  type LoginParams
} from "./login-params.js";
import "./styles.css";

type LoginState = "idle" | "working" | "success" | "error";

const queryParams = (): LoginParams => {
  return loginParamsFromSearch(window.location.search, runtimeConfig);
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

const fieldsAsRecord = (value: unknown): Record<string, unknown> => {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
};

const normalizeMoveBytes = (value: unknown): string => {
  if (!Array.isArray(value)) {
    return "";
  }

  return value.map((byte) => Number(byte).toString(16).padStart(2, "0")).join("");
};

const isDelegateKeyRegistered = async (
  accountId: string,
  publicKey: string,
  delegateAddress: string
): Promise<boolean> => {
  const accountObject = await suiClient.getObject({
    id: accountId,
    options: { showContent: true }
  });
  const content = fieldsAsRecord(accountObject.data?.content);
  const fields = fieldsAsRecord(content.fields);
  const delegateKeys = Array.isArray(fields.delegate_keys) ? fields.delegate_keys : [];
  const normalizedPublicKey = publicKey.replace(/^0x/, "").toLowerCase();
  const normalizedDelegateAddress = delegateAddress.toLowerCase();

  return delegateKeys.some((raw) => {
    const keyFields = fieldsAsRecord(fieldsAsRecord(raw).fields);
    return (
      String(keyFields.sui_address ?? "").toLowerCase() === normalizedDelegateAddress ||
      normalizeMoveBytes(keyFields.public_key).toLowerCase() === normalizedPublicKey
    );
  });
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

type WebSessionChallenge = {
  nonce: string;
  message: string;
  expiresAtMs: number;
};

type WebSessionResponse = {
  ok?: boolean;
  error?: string;
  returnTo?: string;
  accountId?: string;
  walletAddress?: string;
};

const serverUrl = (params: LoginParams, path: string): string => {
  return new URL(path, params.server || window.location.origin).toString();
};

const notifyBrowserHost = (params: LoginParams, type: string, data: Record<string, unknown> = {}): void => {
  const targetOrigin = new URL(params.server || window.location.origin).origin;
  const message = { type, ...data };

  if (window.parent && window.parent !== window) {
    window.parent.postMessage(message, targetOrigin);
  }
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage(message, targetOrigin);
  }
};

const finishBrowserFlow = (params: LoginParams, returnTo: string): void => {
  const target = browserFlowTarget(params, returnTo, window.location.origin);

  if (params.embedded && window.parent && window.parent !== window) {
    notifyBrowserHost(params, "octopus-auth-complete");
    return;
  }

  if (window.opener && !window.opener.closed) {
    notifyBrowserHost(params, "octopus-auth-complete");
    window.setTimeout(() => window.close(), 50);
    window.setTimeout(() => window.location.assign(target), 500);
    return;
  }

  window.location.assign(target);
};

const shortMetricValue = (value: string, fallback: string): string => {
  const text = value.trim();
  if (!text) {
    return fallback;
  }

  if (/^0x[0-9a-fA-F]+$/.test(text) && text.length > 14) {
    return `${text.slice(0, 6)}...${text.slice(-4)}`;
  }

  return text;
};

const waitForDigest = async (digest: unknown): Promise<void> => {
  if (typeof digest !== "string" || !digest) {
    return;
  }

  await suiClient.waitForTransaction({ digest });
};

function MetricValue({ fallback, value }: { fallback: string; value?: string | null }) {
  const fullValue = value?.trim() ?? "";

  return (
    <strong title={fullValue || undefined}>
      {shortMetricValue(fullValue, fallback)}
    </strong>
  );
}

function DetailRow({ label, value, fallback }: { label: string; value?: string | null; fallback: string }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <MetricValue fallback={fallback} value={value} />
    </div>
  );
}

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
    if (await isDelegateKeyRegistered(accountId, publicKey, delegateAddress)) {
      return;
    }

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
    <main className="auth-shell">
      <section className="auth-card" aria-label="Octopus authorization">
        <h1>Authorize CLI Delegate</h1>
        <div className="detail-list">
          <DetailRow label="Wallet" fallback="Not connected" value={account?.address} />
          <DetailRow label="Delegate" fallback="Missing" value={params.delegateAddress} />
          <DetailRow label="Server" fallback="Missing" value={params.server} />
          <DetailRow label="Relay" fallback="Local" value={params.serverDelegateAddress} />
        </div>
        <div className="actions">
          <ConnectButton>Connect Wallet</ConnectButton>
          <button className="authorize-button" disabled={!account?.address || state === "working"} onClick={() => void approve()} type="button">
            {state === "working" ? "Authorizing" : "Authorize"}
          </button>
        </div>
        {message && <p className={`status ${state}`}>{message}</p>}
      </section>
    </main>
  );
}

function WebLoginPanel() {
  const account = useCurrentAccount();
  const kit = useDAppKit();
  const params = useMemo(queryParams, []);
  const autoStarted = useRef(false);
  const [state, setState] = useState<LoginState>("idle");
  const [message, setMessage] = useState("");

  const signIn = useCallback(async () => {
    if (!account?.address) {
      setMessage("Connect a Sui wallet first.");
      return;
    }

    if (!params.server) {
      setState("error");
      setMessage("Missing Octopus server URL.");
      return;
    }

    setState("working");
    setMessage("Preparing wallet signature...");

    try {
      const challengeUrl = new URL(serverUrl(params, "/v1/auth/web-session/challenge"));
      challengeUrl.searchParams.set("returnTo", params.returnTo || "/");
      const challengeResponse = await fetch(challengeUrl, {
        credentials: "include"
      });
      const challenge = await challengeResponse.json() as WebSessionChallenge & { error?: string };
      if (!challengeResponse.ok || !challenge.nonce || !challenge.message) {
        throw new Error(challenge.error ?? `Challenge failed: HTTP ${challengeResponse.status}`);
      }

      setMessage("Sign the Octopus login message in your wallet.");
      const signed = await (kit as unknown as {
        signPersonalMessage: (input: { message: Uint8Array }) => Promise<{ bytes: string; signature: string }>;
      }).signPersonalMessage({
        message: new TextEncoder().encode(challenge.message)
      });

      let accountId: string | null = null;
      if (params.accountRegistryId) {
        try {
          accountId = await resolveAccountId(params.accountRegistryId, account.address);
        } catch {
          accountId = null;
        }
      }

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
      const session = await sessionResponse.json() as WebSessionResponse;
      if (!sessionResponse.ok || !session.ok) {
        throw new Error(session.error ?? `Web session failed: HTTP ${sessionResponse.status}`);
      }

      setState("success");
      setMessage("Login complete.");
      finishBrowserFlow(params, session.returnTo ?? params.returnTo ?? "/");
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setState("error");
      setMessage(text);
      if (params.embedded) {
        notifyBrowserHost(params, "octopus-auth-error", { message: text });
      }
    }
  }, [account, kit, params]);

  useEffect(() => {
    if (!params.autoStart || autoStarted.current || !account?.address || state !== "idle") {
      return;
    }
    autoStarted.current = true;
    void signIn();
  }, [account?.address, params.autoStart, signIn, state]);

  useEffect(() => {
    if (!params.embedded || !params.autoStart || account?.address || state !== "idle" || autoStarted.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (!account?.address && !autoStarted.current) {
        notifyBrowserHost(params, "octopus-auth-needs-wallet");
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [account?.address, params, state]);

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-label="Octopus web sign in">
        <h1>Sign in to Octopus</h1>
        <div className="detail-list">
          <DetailRow label="Wallet" fallback="Not connected" value={account?.address} />
          <DetailRow label="Server" fallback="Missing" value={params.server} />
          <DetailRow label="Return" fallback="/" value={params.returnTo} />
        </div>
        <div className="actions">
          <ConnectButton>Connect Wallet</ConnectButton>
          <button className="authorize-button" disabled={!account?.address || state === "working"} onClick={() => void signIn()} type="button">
            {state === "working" ? "Signing in" : "Sign in"}
          </button>
        </div>
        {message && <p className={`status ${state}`}>{message}</p>}
      </section>
    </main>
  );
}

function UnlockRepoPanel() {
  const account = useCurrentAccount();
  const kit = useDAppKit();
  const params = useMemo(queryParams, []);
  const autoStarted = useRef(false);
  const [state, setState] = useState<LoginState>("idle");
  const [message, setMessage] = useState("");

  const unlock = useCallback(async () => {
    if (!account?.address) {
      setMessage("Connect a Sui wallet first.");
      return;
    }

    if (!params.server || !params.owner || !params.repo) {
      setState("error");
      setMessage("Missing repository unlock parameters.");
      return;
    }

    setState("working");
    setMessage("Preparing repository unlock...");

    try {
      const repoPath = `/v1/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}`;
      const challengeUrl = new URL(serverUrl(params, `${repoPath}/unlock/challenge`));
      challengeUrl.searchParams.set("returnTo", params.returnTo || `/${params.owner}/${params.repo}`);
      const challengeResponse = await fetch(challengeUrl, {
        credentials: "include"
      });
      const challenge = await challengeResponse.json() as WebSessionChallenge & {
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
      const signed = await (kit as unknown as {
        signPersonalMessage: (input: { message: Uint8Array }) => Promise<{ bytes: string; signature: string }>;
      }).signPersonalMessage({
        message: new TextEncoder().encode(challenge.message)
      });

      setMessage("Unlocking repository...");
      const unlockResponse = await fetch(serverUrl(params, `${repoPath}/unlock`), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nonce: challenge.nonce,
          signature: signed.signature
        })
      });
      const result = await unlockResponse.json() as WebSessionResponse & { repoId?: string };
      if (!unlockResponse.ok || !result.ok) {
        throw new Error(result.error ?? `Repository unlock failed: HTTP ${unlockResponse.status}`);
      }

      setState("success");
      setMessage("Repository unlocked.");
      finishBrowserFlow(params, result.returnTo ?? params.returnTo ?? `/${params.owner}/${params.repo}`);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setState("error");
      setMessage(text);
      if (params.embedded) {
        notifyBrowserHost(params, "octopus-auth-error", { message: text });
      }
    }
  }, [account, kit, params]);

  useEffect(() => {
    if (!params.autoStart || autoStarted.current || !account?.address || state !== "idle") {
      return;
    }
    autoStarted.current = true;
    void unlock();
  }, [account?.address, params.autoStart, state, unlock]);

  useEffect(() => {
    if (!params.embedded || !params.autoStart || account?.address || state !== "idle" || autoStarted.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (!account?.address && !autoStarted.current) {
        notifyBrowserHost(params, "octopus-auth-needs-wallet");
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [account?.address, params, state]);

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-label="Octopus repository unlock">
        <h1>Unlock repository</h1>
        <div className="detail-list">
          <DetailRow label="Wallet" fallback="Not connected" value={account?.address} />
          <DetailRow label="Repo" fallback="Missing" value={params.owner && params.repo ? `${params.owner}/${params.repo}` : ""} />
          <DetailRow label="Server" fallback="Missing" value={params.server} />
        </div>
        <div className="actions">
          <ConnectButton>Connect Wallet</ConnectButton>
          <button className="authorize-button" disabled={!account?.address || state === "working"} onClick={() => void unlock()} type="button">
            {state === "working" ? "Unlocking" : "Unlock"}
          </button>
        </div>
        {message && <p className={`status ${state}`}>{message}</p>}
      </section>
    </main>
  );
}

function RepoAccessPanel() {
  const account = useCurrentAccount();
  const kit = useDAppKit();
  const params = useMemo(queryParams, []);
  const autoStarted = useRef(false);
  const [state, setState] = useState<LoginState>("idle");
  const [message, setMessage] = useState("");

  const accessLabel = params.action === "remove" ? "Remove contributor" : "Add contributor";
  const normalizedRole = params.role === "reader" ? "reader" : "writer";
  const normalizedAction = params.action === "remove" ? "remove" : "add";

  const executeAccessChange = useCallback(async () => {
    if (!account?.address) {
      setMessage("Connect a Sui wallet first.");
      return;
    }

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

    try {
      const functionName =
        normalizedAction === "remove"
          ? normalizedRole === "reader" ? "remove_reader" : "remove_member"
          : normalizedRole === "reader" ? "add_reader" : "add_member";
      const tx = new Transaction();
      tx.setSender(account.address);
      tx.moveCall({
        target: `${params.packageId}::registry::${functionName}`,
        arguments: [
          tx.object(params.repoObjectId),
          tx.pure.address(params.walletAddress)
        ]
      });

      setMessage("Approve the contributor change in your wallet.");
      const result = await (kit as unknown as {
        signAndExecuteTransaction: (input: { transaction: Transaction }) => Promise<{ digest?: string } | null>;
      }).signAndExecuteTransaction({ transaction: tx });
      if (!result) {
        throw new Error("Wallet did not return a transaction result");
      }

      setMessage("Waiting for Sui confirmation...");
      await waitForDigest(result.digest);

      setState("success");
      setMessage("Contributor access updated.");
      finishBrowserFlow(params, params.returnTo || `/${params.owner}/${params.repo}/settings/access`);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setState("error");
      setMessage(text);
      if (params.embedded) {
        notifyBrowserHost(params, "octopus-auth-error", { message: text });
      }
    }
  }, [account, kit, normalizedAction, normalizedRole, params]);

  useEffect(() => {
    if (!params.autoStart || autoStarted.current || !account?.address || state !== "idle") {
      return;
    }
    autoStarted.current = true;
    void executeAccessChange();
  }, [account?.address, executeAccessChange, params.autoStart, state]);

  useEffect(() => {
    if (!params.embedded || !params.autoStart || account?.address || state !== "idle" || autoStarted.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (!account?.address && !autoStarted.current) {
        notifyBrowserHost(params, "octopus-auth-needs-wallet");
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [account?.address, params, state]);

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-label="Octopus repository access">
        <h1>{accessLabel}</h1>
        <div className="detail-list">
          <DetailRow label="Wallet" fallback="Not connected" value={account?.address} />
          <DetailRow label="Repo" fallback="Missing" value={params.owner && params.repo ? `${params.owner}/${params.repo}` : ""} />
          <DetailRow label="Contributor" fallback="Missing" value={params.walletAddress} />
          <DetailRow label="Role" fallback="Writer" value={normalizedRole} />
        </div>
        <div className="actions">
          <ConnectButton>Connect Wallet</ConnectButton>
          <button className="authorize-button" disabled={!account?.address || state === "working"} onClick={() => void executeAccessChange()} type="button">
            {state === "working" ? "Updating" : accessLabel}
          </button>
        </div>
        {message && <p className={`status ${state}`}>{message}</p>}
      </section>
    </main>
  );
}

export function App() {
  const params = queryParams();
  const mode = authPanelMode(params.mode);

  return (
    <DAppKitProvider dAppKit={dAppKit}>
      <div className={params.embedded ? "embedded-auth" : undefined}>
        {mode === "access"
          ? <RepoAccessPanel />
          : mode === "unlock"
            ? <UnlockRepoPanel />
            : mode === "web"
              ? <WebLoginPanel />
              : <LoginPanel />}
      </div>
    </DAppKitProvider>
  );
}
