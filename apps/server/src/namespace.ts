import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { isValidSuiAddress, isValidSuiNSName, normalizeSuiAddress, normalizeSuiNSName } from "@mysten/sui/utils";
import type { AuthContext } from "./auth.js";
import type { ServerConfig } from "./config.js";

const errorWithStatus = (message: string, statusCode: number): Error & { statusCode: number } => {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
};

const normalizedAddress = (value: string): string | null => {
  try {
    const normalized = normalizeSuiAddress(value);
    return isValidSuiAddress(normalized) ? normalized : null;
  } catch {
    return null;
  }
};

const nameServiceClient = (config: ServerConfig): SuiJsonRpcClient => {
  return new SuiJsonRpcClient({ url: config.suiRpcUrl, network: config.suiNetwork as "testnet" });
};

const resolvePrimarySuiNSName = async (config: ServerConfig, walletAddress: string): Promise<string | null> => {
  if (config.suiMode !== "testnet") {
    return null;
  }

  try {
    const result = await nameServiceClient(config).resolveNameServiceNames({
      address: walletAddress,
      limit: 1,
      format: "dot"
    });
    return result.data[0] ?? null;
  } catch {
    return null;
  }
};

const resolveSuiNSAddress = async (config: ServerConfig, name: string): Promise<string | null> => {
  if (config.suiMode !== "testnet") {
    throw errorWithStatus("SuiNS owner namespaces require testnet Sui name service resolution", 400);
  }

  try {
    const resolved = await nameServiceClient(config).resolveNameServiceAddress({ name });
    return resolved ? normalizedAddress(resolved) : null;
  } catch (error) {
    throw errorWithStatus(
      `Could not resolve SuiNS owner namespace: ${error instanceof Error ? error.message : String(error)}`,
      503
    );
  }
};

export const resolveRepoOwnerNamespace = async (
  config: ServerConfig,
  auth: AuthContext,
  requestedOwner?: string
): Promise<string> => {
  const walletAddress = normalizedAddress(auth.walletAddress);
  if (!walletAddress) {
    throw errorWithStatus("Authenticated wallet address is not a valid Sui address", 400);
  }

  const owner = requestedOwner?.trim();
  if (!owner) {
    return (await resolvePrimarySuiNSName(config, walletAddress)) ?? walletAddress;
  }

  const ownerAddress = normalizedAddress(owner);
  if (ownerAddress) {
    if (ownerAddress !== walletAddress) {
      throw errorWithStatus("Owner address does not match the authenticated wallet", 403);
    }

    return ownerAddress;
  }

  if (isValidSuiNSName(owner)) {
    const normalizedOwner = normalizeSuiNSName(owner, "dot");
    const resolvedAddress = await resolveSuiNSAddress(config, normalizedOwner);
    if (!resolvedAddress) {
      throw errorWithStatus("SuiNS owner namespace does not resolve to a wallet address", 400);
    }

    if (resolvedAddress !== walletAddress) {
      throw errorWithStatus("SuiNS owner namespace does not belong to the authenticated wallet", 403);
    }

    return normalizedOwner;
  }

  throw errorWithStatus("Owner must be a SuiNS name ending in .sui or the authenticated wallet address", 400);
};
