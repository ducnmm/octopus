import { Transaction } from "@mysten/sui/transactions";
import { toBase64 } from "@mysten/sui/utils";
import { runtimeConfig, suiClient } from "../config.js";
import type { LoginParams } from "../login-params.js";
import { jsonResponse, serverUrl } from "./api.js";
import type { DelegateKit } from "./delegate-kit.js";
import { errorMessage, HttpStatusError } from "./errors.js";
import { hexToBytes, isDelegateKeyRegistered, resolveAccountId, waitForDigest } from "./sui.js";

export type TransactionPolicy = {
  allowedAddresses?: Array<string | null | undefined>;
  allowedMoveCallTargets?: string[];
};

export type TransactionResult = {
  digest?: string;
};

type SponsoredTransaction = {
  digest: string;
  bytes: string;
};

/** Everything needed to build, sponsor, sign, and report a wallet transaction. */
export type WalletContext = {
  kit: DelegateKit;
  params: LoginParams;
  address: string;
  setMessage: (message: string) => void;
};

const uniqueValues = (values: Array<string | null | undefined>): string[] =>
  [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];

const canFallbackFromSponsor = (error: unknown): boolean =>
  error instanceof HttpStatusError && [404, 409, 501, 503].includes(error.status);

const shouldTrySponsoredTransaction = (params: LoginParams): boolean =>
  runtimeConfig.enoki.sponsorTransactions &&
  Boolean(params.server) &&
  runtimeConfig.suiNetwork !== "localnet";

const executeSponsoredTransaction = async (
  { kit, params, setMessage }: WalletContext,
  tx: Transaction,
  policy: TransactionPolicy
): Promise<TransactionResult> => {
  setMessage("Requesting Enoki gas sponsorship...");
  const transactionKindBytes = toBase64(await tx.build({ client: suiClient, onlyTransactionKind: true }));
  const sponsorResponse = await fetch(serverUrl(params, "/v1/enoki/sponsored-transactions"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sender: tx.getData().sender,
      transactionKindBytes,
      allowedAddresses: uniqueValues(policy.allowedAddresses ?? []),
      allowedMoveCallTargets: uniqueValues(policy.allowedMoveCallTargets ?? [])
    })
  });
  const sponsored = await jsonResponse<SponsoredTransaction>(sponsorResponse, "Enoki sponsorship failed");

  setMessage("Sign the sponsored transaction in your wallet.");
  const signed = await kit.signTransaction({ transaction: sponsored.bytes });
  if (!signed.signature) {
    throw new Error("Wallet did not return a transaction signature");
  }

  setMessage("Executing sponsored transaction...");
  const executeResponse = await fetch(
    serverUrl(params, `/v1/enoki/sponsored-transactions/${encodeURIComponent(sponsored.digest)}/execute`),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signature: signed.signature })
    }
  );
  const executed = await jsonResponse<TransactionResult>(executeResponse, "Sponsored transaction execution failed");
  const digest = executed.digest ?? sponsored.digest;
  setMessage("Waiting for Sui confirmation...");
  await waitForDigest(digest);

  return { digest };
};

export const executeWalletTransaction = async (
  context: WalletContext,
  tx: Transaction,
  policy: TransactionPolicy
): Promise<TransactionResult> => {
  const { kit, params, address, setMessage } = context;
  tx.setSender(address);

  if (shouldTrySponsoredTransaction(params)) {
    try {
      return await executeSponsoredTransaction(context, tx, policy);
    } catch (error) {
      if (!canFallbackFromSponsor(error)) {
        throw error;
      }
      setMessage("Approve the transaction in your wallet.");
    }
  }

  const result = await kit.signAndExecuteTransaction({ transaction: tx });
  if (!result) {
    throw new Error("Wallet did not return a transaction result");
  }

  return result;
};

export const createAccount = async (context: WalletContext): Promise<string> => {
  const { params, address } = context;
  const tx = new Transaction();
  tx.moveCall({
    target: `${params.packageId}::account::create_account`,
    arguments: [tx.object(params.accountRegistryId)]
  });
  await executeWalletTransaction(context, tx, {
    allowedAddresses: [address, params.accountRegistryId],
    allowedMoveCallTargets: [`${params.packageId}::account::create_account`]
  });

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    const accountId = await resolveAccountId(params.accountRegistryId, address);
    if (accountId) {
      return accountId;
    }
  }

  throw new Error("Created account, but could not resolve account object ID yet");
};

const addDelegateKey = async (
  context: WalletContext,
  accountId: string,
  publicKey: string,
  delegateAddress: string,
  label: string
): Promise<void> => {
  const { params, address } = context;
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
  await executeWalletTransaction(context, tx, {
    allowedAddresses: [address, accountId, params.accountRegistryId, delegateAddress],
    allowedMoveCallTargets: [`${params.packageId}::account::add_delegate_key`]
  });
};

export const addDelegateKeyIfNeeded = async (
  context: WalletContext,
  accountId: string,
  publicKey: string,
  delegateAddress: string,
  label: string
): Promise<void> => {
  if (await isDelegateKeyRegistered(accountId, publicKey, delegateAddress)) {
    return;
  }

  try {
    await addDelegateKey(context, accountId, publicKey, delegateAddress, label);
  } catch (error) {
    const text = errorMessage(error);
    if (text.includes("EDelegateKeyAlreadyExists") || text.includes("101")) {
      return;
    }
    throw error;
  }
};
