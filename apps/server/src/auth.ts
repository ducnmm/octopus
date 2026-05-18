import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { FastifyRequest } from "fastify";
import { Ed25519Keypair, Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import { fromHex } from "@mysten/sui/utils";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import {
  delegateAuthTokenMessage,
  delegateAuthTokenSchema,
  delegateAuthHeaders,
  registerDelegateRequestSchema,
  type DelegateAuthTokenPayload,
  type RegisterDelegateRequest
} from "@octopus/shared";
import type { ServerConfig } from "./config.js";

export type DelegateIdentity = {
  delegatePrivateKey?: string;
  delegatePublicKey: string;
  delegateAddress: string;
};

export type AuthContext = DelegateIdentity & {
  accountId: string;
  walletAddress: string;
  source: "local" | "testnet";
};

type LocalAccountState = {
  accountId: string;
  walletAddress: string;
  delegateKeys: Array<{
    publicKey: string;
    delegateAddress: string;
    label: string;
    createdAtMs: number;
  }>;
  packageId?: string;
  accountRegistryId?: string;
  repoRegistryId?: string;
  createdAtMs: number;
  updatedAtMs: number;
};

const cache = new Map<string, { expiresAtMs: number; context: AuthContext }>();

const stripHexPrefix = (value: string): string => {
  return value.startsWith("0x") ? value.slice(2) : value;
};

export const redactDelegateSecrets = (input: string): string => {
  return input.replace(/(x-octopus-delegate-key:\s*)\S+/gi, "$1[redacted]")
    .replace(/(x-octopus-auth-token:\s*)\S+/gi, "$1[redacted]")
    .replace(/suiprivkey[1-9A-HJ-NP-Za-km-z]+/g, "[redacted-suiprivkey]");
};

export const keypairFromPrivateKey = (privateKey: string): Ed25519Keypair => {
  const trimmed = privateKey.trim();
  const hex = stripHexPrefix(trimmed);
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    return Ed25519Keypair.fromSecretKey(fromHex(hex));
  }

  return Ed25519Keypair.fromSecretKey(trimmed);
};

export const identityFromPrivateKey = (privateKey: string): DelegateIdentity => {
  const keypair = keypairFromPrivateKey(privateKey);
  return {
    delegatePrivateKey: privateKey,
    delegatePublicKey: Buffer.from(keypair.getPublicKey().toRawBytes()).toString("hex"),
    delegateAddress: keypair.getPublicKey().toSuiAddress()
  };
};

const decodeDelegateAuthToken = (encoded: string): unknown => {
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
  } catch {
    throw new Error("Invalid Octopus auth token");
  }
};

const authScopeForRequest = (request: FastifyRequest): "rest" | "git" => {
  return request.url.includes(".git") ? "git" : "rest";
};

const identityFromAuthToken = async (request: FastifyRequest): Promise<{
  accountId: string;
  identity: DelegateIdentity;
  cacheKey: string;
}> => {
  const tokenHeader = headerValue(request, delegateAuthHeaders.token);
  if (!tokenHeader) {
    throw new Error("Missing Octopus auth token");
  }

  const token = delegateAuthTokenSchema.parse(decodeDelegateAuthToken(tokenHeader));
  const nowMs = Date.now();
  if (token.expiresAtMs <= nowMs) {
    throw new Error("Octopus auth token expired");
  }

  if (token.issuedAtMs > nowMs + 60_000) {
    throw new Error("Octopus auth token is not valid yet");
  }

  const expectedScope = authScopeForRequest(request);
  if (token.scope !== expectedScope) {
    throw new Error(`Octopus auth token scope mismatch: expected ${expectedScope}`);
  }

  const delegatePublicKey = stripHexPrefix(token.delegatePublicKey).toLowerCase();
  const publicKey = new Ed25519PublicKey(fromHex(delegatePublicKey));
  const delegateAddress = publicKey.toSuiAddress();
  if (delegateAddress !== token.delegateAddress) {
    throw new Error("Octopus auth token delegate address does not match public key");
  }

  const payload: DelegateAuthTokenPayload = {
    v: token.v,
    accountId: token.accountId,
    delegatePublicKey,
    delegateAddress: token.delegateAddress,
    scope: token.scope,
    issuedAtMs: token.issuedAtMs,
    expiresAtMs: token.expiresAtMs
  };
  const valid = await publicKey.verifyPersonalMessage(
    Buffer.from(delegateAuthTokenMessage(payload), "utf8"),
    token.signature
  );
  if (!valid) {
    throw new Error("Invalid Octopus auth token signature");
  }

  return {
    accountId: token.accountId,
    identity: {
      delegatePublicKey,
      delegateAddress
    },
    cacheKey: `${token.accountId}:${delegateAddress}:${delegatePublicKey}:${token.scope}:${token.expiresAtMs}:${token.signature}`
  };
};

const headerValue = (request: FastifyRequest, name: string): string | null => {
  const value = request.headers[name];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
};

const localAccountId = (walletAddress: string): string => {
  const digest = createHash("sha256").update(walletAddress).digest("hex").slice(0, 40);
  return `local:${digest}`;
};

const accountPath = (config: ServerConfig, accountId: string): string => {
  const safeAccountId = accountId.replace(/[^A-Za-z0-9._:-]+/g, "_");
  return join(config.dataDir, "sui", "accounts", `${safeAccountId}.json`);
};

const readLocalAccount = async (
  config: ServerConfig,
  accountId: string
): Promise<LocalAccountState | null> => {
  try {
    return JSON.parse(await readFile(accountPath(config, accountId), "utf8")) as LocalAccountState;
  } catch {
    return null;
  }
};

const writeLocalAccount = async (
  config: ServerConfig,
  account: LocalAccountState
): Promise<void> => {
  const path = accountPath(config, account.accountId);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(account, null, 2)}\n`);
};

export const registerLocalDelegate = async (
  config: ServerConfig,
  input: RegisterDelegateRequest
): Promise<LocalAccountState> => {
  const parsed = registerDelegateRequestSchema.parse(input);
  const accountId = parsed.accountId ?? localAccountId(parsed.walletAddress);
  const existing = await readLocalAccount(config, accountId);
  const now = Date.now();
  const account: LocalAccountState = existing ?? {
    accountId,
    walletAddress: parsed.walletAddress,
    delegateKeys: [],
    packageId: parsed.packageId,
    accountRegistryId: parsed.accountRegistryId,
    repoRegistryId: parsed.repoRegistryId,
    createdAtMs: now,
    updatedAtMs: now
  };

  if (account.walletAddress !== parsed.walletAddress) {
    throw new Error("Account is already bound to a different wallet");
  }

  const existingKey = account.delegateKeys.find(
    (key) => key.delegateAddress === parsed.delegateAddress || key.publicKey === stripHexPrefix(parsed.delegatePublicKey)
  );
  if (!existingKey) {
    account.delegateKeys.push({
      publicKey: stripHexPrefix(parsed.delegatePublicKey).toLowerCase(),
      delegateAddress: parsed.delegateAddress,
      label: parsed.label,
      createdAtMs: now
    });
  }

  account.packageId = parsed.packageId ?? account.packageId;
  account.accountRegistryId = parsed.accountRegistryId ?? account.accountRegistryId;
  account.repoRegistryId = parsed.repoRegistryId ?? account.repoRegistryId;
  account.updatedAtMs = now;
  await writeLocalAccount(config, account);
  return account;
};

const verifyLocalDelegate = async (
  config: ServerConfig,
  identity: DelegateIdentity,
  accountId: string
): Promise<AuthContext> => {
  const account = await readLocalAccount(config, accountId);
  if (!account) {
    throw new Error("Unknown Octopus account");
  }

  const publicKey = identity.delegatePublicKey.toLowerCase();
  const registered = account.delegateKeys.some(
    (key) => key.delegateAddress === identity.delegateAddress && key.publicKey.toLowerCase() === publicKey
  );
  if (!registered) {
    throw new Error("Delegate key is not registered for this account");
  }

  return {
    ...identity,
    accountId,
    walletAddress: account.walletAddress,
    source: "local"
  };
};

const fieldsAsRecord = (value: unknown): Record<string, unknown> => {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
};

const normalizeMoveBytes = (value: unknown): string => {
  if (!Array.isArray(value)) {
    return "";
  }

  return Buffer.from(value.map((byte) => Number(byte))).toString("hex");
};

const verifyTestnetDelegate = async (
  config: ServerConfig,
  identity: DelegateIdentity,
  accountId: string
): Promise<AuthContext> => {
  const client = new SuiJsonRpcClient({ url: config.suiRpcUrl, network: config.suiNetwork as "testnet" });
  const object = await client.getObject({
    id: accountId,
    options: { showContent: true }
  });
  const content = fieldsAsRecord(object.data?.content);
  const fields = fieldsAsRecord(content.fields);
  const owner = String(fields.owner ?? "");
  const delegateKeys = Array.isArray(fields.delegate_keys) ? fields.delegate_keys : [];
  const publicKey = identity.delegatePublicKey.toLowerCase();
  const registered = delegateKeys.some((raw) => {
    const keyFields = fieldsAsRecord(fieldsAsRecord(raw).fields);
    return (
      String(keyFields.sui_address ?? "") === identity.delegateAddress &&
      normalizeMoveBytes(keyFields.public_key).toLowerCase() === publicKey
    );
  });

  if (!owner || !registered) {
    throw new Error("Delegate key is not registered on-chain");
  }

  return {
    ...identity,
    accountId,
    walletAddress: owner,
    source: "testnet"
  };
};

export const parseDelegateAuth = async (
  config: ServerConfig,
  request: FastifyRequest
): Promise<AuthContext> => {
  let accountId: string;
  let identity: DelegateIdentity;
  let cacheKey: string;

  if (headerValue(request, delegateAuthHeaders.token)) {
    const tokenAuth = await identityFromAuthToken(request);
    accountId = tokenAuth.accountId;
    identity = tokenAuth.identity;
    cacheKey = tokenAuth.cacheKey;
  } else {
    const delegatePrivateKey = headerValue(request, delegateAuthHeaders.delegateKey);
    accountId = headerValue(request, delegateAuthHeaders.accountId) ?? "";
    if (!delegatePrivateKey || !accountId) {
      throw new Error("Missing Octopus delegate auth headers");
    }

    identity = identityFromPrivateKey(delegatePrivateKey);
    cacheKey = `${accountId}:${identity.delegateAddress}:${identity.delegatePublicKey}:legacy`;
  }

  const scopedCacheKey = `${config.suiMode}:${cacheKey}`;
  const cached = cache.get(scopedCacheKey);
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.context;
  }

  try {
    const context =
      config.suiMode === "testnet"
        ? await verifyTestnetDelegate(config, identity, accountId)
        : await verifyLocalDelegate(config, identity, accountId);
    cache.set(scopedCacheKey, {
      context,
      expiresAtMs: Date.now() + config.delegateCacheTtlMs
    });
    return context;
  } catch (error) {
    cache.delete(scopedCacheKey);
    throw error;
  }
};
