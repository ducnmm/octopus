import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { SealClient, SessionKey, EncryptedObject, type KeyServerConfig } from "@mysten/seal";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { keypairFromPrivateKey } from "./auth.js";

export type LocalSealEnvelope = {
  mode: "local-seal";
  keyId: string;
  nonce: string;
  authTag: string;
};

export type SealV1Envelope = {
  mode: "seal-v1";
  packageId: string;
  approvePackageId: string;
  repoObjectId: string;
  accountId: string;
  keyId: string;
  threshold: number;
  keyServers: Array<Omit<KeyServerConfig, "apiKey">>;
};

export type SealEnvelope = LocalSealEnvelope | SealV1Envelope;

const DEFAULT_TESTNET_KEY_SERVERS = [
  "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
  "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8",
  "0x6068c0acb197dddbacd4746a9de7f025b2ed5a5b6c1b1ab44dade4426d141da2",
  "0x5466b7df5c15b508678d51496ada8afab0d6f70a01c10613123382b1b8131007"
];

const stripHexPrefix = (value: string): string => value.replace(/^0x/, "");

const parseHexBytes = (hex: string): number[] => {
  const clean = stripHexPrefix(hex);
  if (!clean || clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) {
    throw new Error(`Invalid SEAL key id: ${hex}`);
  }

  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(Number.parseInt(clean.slice(i, i + 2), 16));
  }
  return bytes;
};

const deriveLocalKey = (repoId: string): Buffer => {
  return createHash("sha256")
    .update("octopus-local-seal:")
    .update(repoId)
    .digest();
};

export const sealKeyIdForRepo = (repoObjectId: string): string => {
  return stripHexPrefix(repoObjectId).toLowerCase();
};

const localSealKeyIdForRepo = (repoId: string): string => {
  return createHash("sha256")
    .update("octopus-repo-key:")
    .update(repoId)
    .digest("hex");
};

const parseSealServerConfigs = (raw: string | undefined): KeyServerConfig[] => {
  if (!raw?.trim()) {
    return [];
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("SEAL_SERVER_CONFIGS must be a JSON array");
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`SEAL_SERVER_CONFIGS[${index}] must be an object`);
    }

    const rawConfig = item as Record<string, unknown>;
    const objectId = typeof rawConfig.objectId === "string" ? rawConfig.objectId.trim() : "";
    if (!objectId) {
      throw new Error(`SEAL_SERVER_CONFIGS[${index}].objectId is required`);
    }

    const weight = rawConfig.weight === undefined ? 1 : Number(rawConfig.weight);
    if (!Number.isInteger(weight) || weight < 1) {
      throw new Error(`SEAL_SERVER_CONFIGS[${index}].weight must be a positive integer`);
    }

    const apiKeyName = typeof rawConfig.apiKeyName === "string" ? rawConfig.apiKeyName.trim() : undefined;
    const apiKey = typeof rawConfig.apiKey === "string" ? rawConfig.apiKey.trim() : undefined;
    if ((apiKeyName && !apiKey) || (!apiKeyName && apiKey)) {
      throw new Error(`SEAL_SERVER_CONFIGS[${index}] must include both apiKeyName and apiKey, or neither`);
    }

    return {
      objectId,
      weight,
      ...(typeof rawConfig.aggregatorUrl === "string" && rawConfig.aggregatorUrl.trim()
        ? { aggregatorUrl: rawConfig.aggregatorUrl.trim() }
        : {}),
      ...(apiKeyName && apiKey ? { apiKeyName, apiKey } : {})
    };
  });
};

const resolveSealServerConfigs = (input: {
  suiNetwork?: string;
  sealServerConfigs?: string;
  sealKeyServers?: string[];
  envelopeKeyServers?: Array<Omit<KeyServerConfig, "apiKey">>;
}): KeyServerConfig[] => {
  const fromJson = parseSealServerConfigs(input.sealServerConfigs);
  if (fromJson.length > 0) {
    return fromJson;
  }

  const objectIds =
    input.sealKeyServers && input.sealKeyServers.length > 0
      ? input.sealKeyServers
      : input.envelopeKeyServers && input.envelopeKeyServers.length > 0
        ? input.envelopeKeyServers.map((server) => server.objectId)
        : input.suiNetwork === "testnet"
          ? DEFAULT_TESTNET_KEY_SERVERS
          : [];

  return objectIds.map((objectId) => ({ objectId, weight: 1 }));
};

const resolveSealThreshold = (
  configured: number | undefined,
  keyServers: KeyServerConfig[],
  envelopeThreshold?: number
): number => {
  const totalWeight = keyServers.reduce((sum, server) => sum + server.weight, 0);
  const threshold = configured ?? envelopeThreshold ?? 1;
  if (!Number.isInteger(threshold) || threshold < 1) {
    throw new Error("SEAL_THRESHOLD must be a positive integer");
  }
  if (totalWeight > 0 && threshold > totalWeight) {
    throw new Error("SEAL_THRESHOLD must be less than or equal to total configured SEAL server weight");
  }
  return threshold;
};

const publicKeyServerConfig = (config: KeyServerConfig): Omit<KeyServerConfig, "apiKey"> => {
  const { apiKey: _apiKey, ...safeConfig } = config;
  return safeConfig;
};

const sealClient = (input: {
  suiRpcUrl?: string;
  suiNetwork?: string;
  keyServers: KeyServerConfig[];
}): SealClient => {
  const network = input.suiNetwork === "mainnet" ? "mainnet" : "testnet";
  const client = new SuiJsonRpcClient({
    url: input.suiRpcUrl ?? process.env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443",
    network
  });

  return new SealClient({
    suiClient: client as never,
    serverConfigs: input.keyServers,
    verifyKeyServers: false
  });
};

const encryptArtifactWithLocalSeal = async (input: {
  sourcePath: string;
  outputPath: string;
  repoId: string;
}): Promise<LocalSealEnvelope> => {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveLocalKey(input.repoId), nonce);
  const plaintext = await readFile(input.sourcePath);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  await writeFile(input.outputPath, ciphertext);

  return {
    mode: "local-seal",
    keyId: localSealKeyIdForRepo(input.repoId),
    nonce: nonce.toString("hex"),
    authTag: authTag.toString("hex")
  };
};

const decryptArtifactWithLocalSeal = async (input: {
  sourcePath: string;
  outputPath: string;
  repoId: string;
  envelope: LocalSealEnvelope;
}): Promise<void> => {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveLocalKey(input.repoId),
    Buffer.from(input.envelope.nonce, "hex")
  );
  decipher.setAuthTag(Buffer.from(input.envelope.authTag, "hex"));
  const ciphertext = await readFile(input.sourcePath);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  await writeFile(input.outputPath, plaintext);
};

export const encryptArtifactForRepo = async (input: {
  sourcePath: string;
  outputPath: string;
  repoId: string;
  packageId?: string;
  repoObjectId?: string;
  accountId?: string;
  sealMode?: "local" | "seal";
  suiRpcUrl?: string;
  suiNetwork?: string;
  sealServerConfigs?: string;
  sealKeyServers?: string[];
  sealThreshold?: number;
  allowLocalSealFallback?: boolean;
}): Promise<SealEnvelope> => {
  const localFallback = async (reason: string): Promise<SealEnvelope> => {
    if (input.allowLocalSealFallback === false) {
      throw new Error(`Private artifact encryption requires SEAL for durable storage: ${reason}`);
    }
    return await encryptArtifactWithLocalSeal(input);
  };

  if (input.sealMode !== "seal" || !input.packageId || !input.repoObjectId || !input.accountId) {
    return await localFallback("OCTOPUS_SEAL_MODE=seal, package ID, repo object ID, and account ID are required");
  }

  const keyServers = resolveSealServerConfigs(input);
  if (keyServers.length === 0) {
    return await localFallback("at least one SEAL key server is required");
  }

  const threshold = resolveSealThreshold(input.sealThreshold, keyServers);
  const keyId = sealKeyIdForRepo(input.repoObjectId);
  const client = sealClient({
    suiRpcUrl: input.suiRpcUrl,
    suiNetwork: input.suiNetwork,
    keyServers
  });
  const plaintext = await readFile(input.sourcePath);
  const encrypted = await client.encrypt({
    threshold,
    packageId: input.packageId,
    id: keyId,
    data: new Uint8Array(plaintext)
  });
  await writeFile(input.outputPath, Buffer.from(encrypted.encryptedObject));

  return {
    mode: "seal-v1",
    packageId: input.packageId,
    approvePackageId: input.packageId,
    repoObjectId: input.repoObjectId,
    accountId: input.accountId,
    keyId,
    threshold,
    keyServers: keyServers.map(publicKeyServerConfig)
  };
};

export const decryptArtifactForRepo = async (input: {
  sourcePath: string;
  outputPath: string;
  repoId: string;
  envelope: SealEnvelope;
  accountId?: string;
  serverSuiPrivateKey?: string;
  suiRpcUrl?: string;
  suiNetwork?: string;
  sealServerConfigs?: string;
  sealKeyServers?: string[];
  sealThreshold?: number;
}): Promise<void> => {
  if (input.envelope.mode === "local-seal") {
    await decryptArtifactWithLocalSeal({
      sourcePath: input.sourcePath,
      outputPath: input.outputPath,
      repoId: input.repoId,
      envelope: input.envelope
    });
    return;
  }

  if (!input.serverSuiPrivateKey) {
    throw new Error("SEAL decrypt requires SERVER_SUI_PRIVATE_KEYS");
  }

  const encryptedData = new Uint8Array(await readFile(input.sourcePath));
  const parsed = EncryptedObject.parse(encryptedData);
  const fullId = parsed.id;
  if (stripHexPrefix(fullId).toLowerCase() !== input.envelope.keyId.toLowerCase()) {
    throw new Error(`SEAL key id mismatch: expected ${input.envelope.keyId}, got ${fullId}`);
  }

  const keyServers = resolveSealServerConfigs({
    suiNetwork: input.suiNetwork,
    sealServerConfigs: input.sealServerConfigs,
    sealKeyServers: input.sealKeyServers,
    envelopeKeyServers: input.envelope.keyServers
  });
  const threshold = resolveSealThreshold(input.sealThreshold, keyServers, input.envelope.threshold);
  const network = input.suiNetwork === "mainnet" ? "mainnet" : "testnet";
  const client = new SuiJsonRpcClient({
    url: input.suiRpcUrl ?? process.env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443",
    network
  });
  const seal = new SealClient({
    suiClient: client as never,
    serverConfigs: keyServers,
    verifyKeyServers: false
  });
  const keypair = keypairFromPrivateKey(input.serverSuiPrivateKey);
  const callerAddress = keypair.getPublicKey().toSuiAddress();
  const sessionKey = await SessionKey.create({
    address: callerAddress,
    packageId: input.envelope.packageId,
    ttlMin: 5,
    signer: keypair,
    suiClient: client as never
  });

  const tx = new Transaction();
  tx.moveCall({
    target: `${input.envelope.approvePackageId}::registry::seal_approve`,
    arguments: [
      tx.pure.vector("u8", parseHexBytes(fullId)),
      tx.object(input.envelope.repoObjectId),
      tx.object(input.accountId ?? input.envelope.accountId)
    ]
  });
  const txBytes = await tx.build({
    client: client as never,
    onlyTransactionKind: true
  });

  await seal.fetchKeys({
    ids: [fullId],
    txBytes,
    sessionKey,
    threshold
  });

  const plaintext = await seal.decrypt({
    data: encryptedData,
    sessionKey,
    txBytes
  });
  await writeFile(input.outputPath, Buffer.from(plaintext));
};
