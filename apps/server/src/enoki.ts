import { EnokiClient, EnokiClientError, type EnokiNetwork } from "@mysten/enoki";
import type { ServerConfig } from "./config.js";

export type SponsoredTransactionInput = {
  sender: string;
  transactionKindBytes: string;
  allowedAddresses?: string[];
  allowedMoveCallTargets?: string[];
};

export type ExecuteSponsoredTransactionInput = {
  digest: string;
  signature: string;
};

export type SponsoredTransactionResponse = {
  digest: string;
  bytes: string;
};

export type ExecuteSponsoredTransactionResponse = {
  digest: string;
};

const addressPattern = /^0x[0-9a-fA-F]{1,64}$/;
const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;
const digestPattern = /^[A-Za-z0-9]+$/;

const httpError = (message: string, statusCode: number): Error & { statusCode: number } => {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
};

const enokiNetwork = (network: string): EnokiNetwork | null => {
  if (network === "mainnet" || network === "testnet" || network === "devnet") {
    return network;
  }

  return null;
};

const normalizeAddress = (value: unknown, label: string): string => {
  const address = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!addressPattern.test(address)) {
    throw httpError(`${label} must be a Sui address`, 400);
  }

  return address;
};

const uniqueAddresses = (values: unknown[]): string[] => {
  const addresses = values
    .filter((value) => typeof value === "string" && value.trim())
    .map((value, index) => normalizeAddress(value, `allowedAddresses[${index}]`));

  return [...new Set(addresses)].slice(0, 32);
};

const moveTargets = (config: ServerConfig): string[] => {
  if (!config.suiPackageId) {
    return [];
  }

  return [
    `${config.suiPackageId}::account::create_account`,
    `${config.suiPackageId}::account::add_delegate_key`,
    `${config.suiPackageId}::registry::add_member`,
    `${config.suiPackageId}::registry::add_reader`,
    `${config.suiPackageId}::registry::remove_member`,
    `${config.suiPackageId}::registry::remove_reader`
  ];
};

const allowedMoveTargets = (config: ServerConfig, requested: unknown): string[] => {
  const allowed = new Set(moveTargets(config));
  if (allowed.size === 0) {
    throw httpError("Octopus Sui package is not configured", 409);
  }

  const requestedTargets = Array.isArray(requested)
    ? requested.filter((target): target is string => typeof target === "string" && Boolean(target.trim()))
    : [];
  if (requestedTargets.length === 0) {
    return [...allowed];
  }

  for (const target of requestedTargets) {
    if (!allowed.has(target)) {
      throw httpError("Transaction move target is not eligible for Enoki sponsorship", 403);
    }
  }

  return [...new Set(requestedTargets)];
};

const parseSponsorInput = (body: unknown): SponsoredTransactionInput => {
  if (!body || typeof body !== "object") {
    throw httpError("Sponsor request body must be an object", 400);
  }

  const record = body as Record<string, unknown>;
  const transactionKindBytes = typeof record.transactionKindBytes === "string"
    ? record.transactionKindBytes.trim()
    : "";
  if (!transactionKindBytes || !base64Pattern.test(transactionKindBytes)) {
    throw httpError("transactionKindBytes must be a base64 string", 400);
  }

  return {
    sender: normalizeAddress(record.sender, "sender"),
    transactionKindBytes,
    allowedAddresses: Array.isArray(record.allowedAddresses)
      ? uniqueAddresses(record.allowedAddresses)
      : [],
    allowedMoveCallTargets: Array.isArray(record.allowedMoveCallTargets)
      ? record.allowedMoveCallTargets.filter((target): target is string => typeof target === "string" && Boolean(target.trim()))
      : []
  };
};

const parseExecuteInput = (digest: unknown, body: unknown): ExecuteSponsoredTransactionInput => {
  const normalizedDigest = typeof digest === "string" ? digest.trim() : "";
  if (!normalizedDigest || !digestPattern.test(normalizedDigest)) {
    throw httpError("Sponsored transaction digest is invalid", 400);
  }

  if (!body || typeof body !== "object") {
    throw httpError("Execute request body must be an object", 400);
  }

  const signature = typeof (body as Record<string, unknown>).signature === "string"
    ? String((body as Record<string, unknown>).signature).trim()
    : "";
  if (!signature) {
    throw httpError("signature is required", 400);
  }

  return { digest: normalizedDigest, signature };
};

const enokiClient = (config: ServerConfig): EnokiClient => {
  if (!config.enokiPrivateApiKey) {
    throw httpError("Enoki sponsorship is not configured", 503);
  }

  return new EnokiClient({
    apiKey: config.enokiPrivateApiKey,
    ...(config.enokiApiUrl ? { apiUrl: config.enokiApiUrl } : {})
  });
};

export const enokiSponsorshipEnabled = (config: ServerConfig): boolean => {
  return Boolean(config.enokiPrivateApiKey && enokiNetwork(config.suiNetwork) && config.suiPackageId);
};

export const createSponsoredTransaction = async (
  config: ServerConfig,
  body: unknown
): Promise<SponsoredTransactionResponse> => {
  const network = enokiNetwork(config.suiNetwork);
  if (!network) {
    throw httpError("Enoki sponsorship requires Sui mainnet, testnet, or devnet", 409);
  }

  const input = parseSponsorInput(body);
  const allowedAddresses = uniqueAddresses([
    input.sender,
    config.accountRegistryId,
    config.repoRegistryId,
    ...(input.allowedAddresses ?? [])
  ]);

  try {
    return await enokiClient(config).createSponsoredTransaction({
      sender: input.sender,
      network,
      transactionKindBytes: input.transactionKindBytes,
      allowedAddresses,
      allowedMoveCallTargets: allowedMoveTargets(config, input.allowedMoveCallTargets)
    });
  } catch (error) {
    if (error instanceof EnokiClientError) {
      const message = error.errors[0]?.message ?? "Enoki sponsorship failed";
      throw httpError(message, error.status);
    }
    throw error;
  }
};

export const executeSponsoredTransaction = async (
  config: ServerConfig,
  digest: unknown,
  body: unknown
): Promise<ExecuteSponsoredTransactionResponse> => {
  const input = parseExecuteInput(digest, body);

  try {
    return await enokiClient(config).executeSponsoredTransaction(input);
  } catch (error) {
    if (error instanceof EnokiClientError) {
      const message = error.errors[0]?.message ?? "Sponsored transaction execution failed";
      throw httpError(message, error.status);
    }
    throw error;
  }
};
