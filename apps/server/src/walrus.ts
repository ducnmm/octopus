import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/sui/utils";
import { WalrusClient, blobIdFromInt } from "@mysten/walrus";
import { envInt } from "@octopus/shared";
import { serializeError } from "./error-details.js";

type WalrusStorageMode = "local" | "walrus-cli" | "walrus-relay";

export type ArtifactStoreResult = {
  blobId: string;
  blobObjectId?: string;
  storedArtifactPath: string;
  alreadyExisted: boolean;
  storageDurationEpochs: number;
  storageMode: WalrusStorageMode;
  blobOwnerAddress?: string;
  ownershipTransferred?: boolean;
};

export type WalrusBlobMetadata = Record<string, string>;

export type ArtifactReadResult = {
  blobId: string;
  artifactPath: string;
  storageMode: "local" | "walrus-cli" | "walrus-aggregator";
};

type WalrusStoreResult = {
  blobId: string;
  blobObjectId?: string;
  storageDurationEpochs: number;
  alreadyExisted: boolean;
  blobOwnerAddress?: string;
  ownershipTransferred?: boolean;
};

type WalrusNetwork = "testnet" | "mainnet";

type RelaySigner = {
  keyRaw: string;
  keypair: Ed25519Keypair;
  client: SuiJsonRpcClient;
  address: string;
};

type WalrusLogger = {
  info: (bindings: Record<string, unknown>, message?: string) => void;
  error: (bindings: Record<string, unknown>, message?: string) => void;
};

type WalrusLogContext = Record<string, unknown>;

type WalrusLogInput = {
  logger?: WalrusLogger;
  logContext?: WalrusLogContext;
};

const DEFAULT_WALRUS_EPOCHS = 50;
const WALRUS_RELAY_TIP_MIST = 10_000_000;

const signerByKey = new Map<string, RelaySigner>();
const walrusClientByKey = new Map<string, WalrusClient>();

const runWalrus = async (args: string[]): Promise<{ stdout: string; stderr: string }> => {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(process.env.WALRUS_BIN ?? "walrus", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      reject(
        new Error(
          `Failed to run walrus binary: ${error.message}. Set OCTOPUS_WALRUS_MODE=local to use local fallback.`
        )
      );
    });
    child.on("close", (code) => {
      const result = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      };

      if (code === 0) {
        resolvePromise(result);
        return;
      }

      reject(new Error(`walrus ${args.join(" ")} failed: ${result.stderr || result.stdout}`));
    });
  });
};

const parseWalrusStoreOutput = (stdout: string, stderr: string): WalrusStoreResult => {
  const combined = `${stdout}\n${stderr}`;

  try {
    let parsed = JSON.parse(stdout) as Record<string, unknown> | Array<Record<string, unknown>>;
    if (Array.isArray(parsed)) {
      const first = parsed[0];
      parsed = (first?.blobStoreResult as Record<string, unknown> | undefined) ?? first ?? {};
    }

    if (parsed.newlyCreated) {
      const newlyCreated = parsed.newlyCreated as Record<string, unknown>;
      const blobObject = newlyCreated.blobObject as Record<string, unknown>;
      const id = blobObject.id as Record<string, unknown> | undefined;

      return {
        blobId: String(blobObject.blobId ?? blobObject.blob_id ?? ""),
        blobObjectId: id?.id ? String(id.id) : undefined,
        storageDurationEpochs: Number(blobObject.storedEpoch ?? blobObject.stored_epoch ?? 0),
        alreadyExisted: false
      };
    }

    if (parsed.alreadyCertified) {
      const alreadyCertified = parsed.alreadyCertified as Record<string, unknown>;
      return {
        blobId: String(alreadyCertified.blobId ?? alreadyCertified.blob_id ?? ""),
        storageDurationEpochs: 0,
        alreadyExisted: true
      };
    }
  } catch {
    // Fall back to plaintext parsing for older walrus CLI versions.
  }

  const blobId = combined.match(/Blob ID:\s+(\S+)/)?.[1];
  if (!blobId) {
    throw new Error(`Failed to parse walrus store output:\n${combined}`);
  }

  return {
    blobId,
    blobObjectId: combined.match(/Object ID:\s+(0x\S+)/)?.[1],
    storageDurationEpochs: Number.parseInt(combined.match(/End Epoch:\s+(\d+)/)?.[1] ?? "0", 10),
    alreadyExisted: /already certified/i.test(combined)
  };
};

const storeWithWalrusCli = async (artifactPath: string): Promise<WalrusStoreResult> => {
  const epochs = envInt(process.env.OCTOPUS_WALRUS_EPOCHS, DEFAULT_WALRUS_EPOCHS);
  const result = await runWalrus(["store", artifactPath, "--json", "--epochs", String(epochs)]);
  return parseWalrusStoreOutput(result.stdout, result.stderr);
};

const normalizeWalrusNetwork = (network: string | undefined): WalrusNetwork => {
  return network === "mainnet" ? "mainnet" : "testnet";
};

const defaultRelayUrl = (network: WalrusNetwork): string => {
  return network === "mainnet"
    ? "https://upload-relay.mainnet.walrus.space"
    : "https://upload-relay.testnet.walrus.space";
};

const walrusStepBindings = (
  input: WalrusLogInput,
  step: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> => ({
  ...input.logContext,
  step,
  ...extra
});

const logWalrusInfo = (
  input: WalrusLogInput,
  step: string,
  message: string,
  extra: Record<string, unknown> = {}
): void => {
  input.logger?.info(walrusStepBindings(input, step, extra), message);
};

const runWalrusStep = async <T>(
  input: WalrusLogInput,
  step: string,
  task: () => Promise<T>,
  extra: Record<string, unknown> = {}
): Promise<T> => {
  const startedAtMs = Date.now();
  logWalrusInfo(input, step, "walrus step started", extra);
  try {
    const result = await task();
    logWalrusInfo(input, step, "walrus step completed", {
      ...extra,
      durationMs: Date.now() - startedAtMs
    });
    return result;
  } catch (error) {
    input.logger?.error(
      walrusStepBindings(input, step, {
        ...extra,
        durationMs: Date.now() - startedAtMs,
        error: serializeError(error)
      }),
      "walrus step failed"
    );
    throw error;
  }
};

const buildKeypairFromSecret = (raw: string): Ed25519Keypair => {
  const trimmed = raw.trim();
  if (trimmed.startsWith("suiprivkey")) {
    return Ed25519Keypair.fromSecretKey(trimmed);
  }

  const clean = trimmed.replace(/^0x/, "");
  if (clean.length !== 64 && clean.length !== 128) {
    throw new Error("Invalid server Sui private key. Expected suiprivkey... or 32-byte hex.");
  }

  const seedHex = clean.length === 128 ? clean.slice(0, 64) : clean;
  if (/[^0-9a-f]/i.test(seedHex)) {
    throw new Error("Invalid server Sui private key hex.");
  }

  return Ed25519Keypair.fromSecretKey(fromHex(seedHex));
};

const firstServerKey = (keys: string[] | undefined): string => {
  const key = [
    ...(keys ?? []),
    process.env.SERVER_SUI_PRIVATE_KEY,
    process.env.SERVER_ADMIN_PRIVATE_KEY,
    process.env.PUBLISHER_PRIVATE_KEY
  ].find((value): value is string => Boolean(value?.trim()));
  if (!key) {
    throw new Error(
      "OCTOPUS_WALRUS_MODE=relay requires SERVER_SUI_PRIVATE_KEYS or SERVER_SUI_PRIVATE_KEY"
    );
  }
  return key;
};

const relaySigner = (input: {
  serverSuiPrivateKeys?: string[];
  suiRpcUrl?: string;
  walrusNetwork?: string;
}): RelaySigner => {
  const keyRaw = firstServerKey(input.serverSuiPrivateKeys);
  const cached = signerByKey.get(keyRaw);
  if (cached) {
    return cached;
  }

  const keypair = buildKeypairFromSecret(keyRaw);
  const signer: RelaySigner = {
    keyRaw,
    keypair,
    client: new SuiJsonRpcClient({
      url: input.suiRpcUrl ?? process.env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443",
      network: normalizeWalrusNetwork(input.walrusNetwork)
    }),
    address: keypair.getPublicKey().toSuiAddress()
  };
  signerByKey.set(keyRaw, signer);
  return signer;
};

const relayClient = (input: {
  signer: RelaySigner;
  walrusNetwork?: string;
  walrusUploadRelayUrl?: string;
}): WalrusClient => {
  const network = normalizeWalrusNetwork(input.walrusNetwork ?? process.env.WALRUS_NETWORK);
  const relayUrl = (input.walrusUploadRelayUrl ?? process.env.WALRUS_UPLOAD_RELAY_URL ?? defaultRelayUrl(network))
    .replace(/\/+$/, "");
  const cacheKey = `${input.signer.keyRaw}:${network}:${relayUrl}`;
  const cached = walrusClientByKey.get(cacheKey);
  if (cached) {
    return cached;
  }

  const client = new WalrusClient({
    network,
    suiClient: input.signer.client as never,
    uploadRelay: {
      host: relayUrl,
      sendTip: { max: WALRUS_RELAY_TIP_MIST }
    }
  });
  walrusClientByKey.set(cacheKey, client);
  return client;
};

const setFreshGasPayment = async (signer: RelaySigner, tx: Transaction): Promise<void> => {
  try {
    const coins = await signer.client.getCoins({
      owner: signer.address,
      coinType: "0x2::sui::SUI",
      limit: 10
    });
    if (coins.data.length > 0) {
      tx.setGasPayment(
        coins.data.map((coin) => ({
          objectId: coin.coinObjectId,
          version: coin.version,
          digest: coin.digest
        }))
      );
    }
  } catch {
    // Let the Sui SDK select gas if the explicit coin refresh is unavailable.
  }
};

const executeWalrusTransaction = async (signer: RelaySigner, tx: Transaction): Promise<string> => {
  await setFreshGasPayment(signer, tx);
  const result = await signer.client.signAndExecuteTransaction({
    signer: signer.keypair,
    transaction: tx,
    options: {
      showEffects: true
    }
  });
  const error = result.effects?.status.status === "failure" ? result.effects.status.error : undefined;
  if (error) {
    throw new Error(`Walrus relay Sui transaction failed: ${error}`);
  }
  if (!result.digest) {
    throw new Error("Walrus relay Sui transaction did not return a digest");
  }
  return result.digest;
};

const objectIdString = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") {
    return value.id;
  }
  return undefined;
};

const isSuiAddress = (value: string | undefined): value is string => {
  return Boolean(value && /^0x[0-9a-fA-F]{64}$/.test(value));
};

const transferBlobObject = async (
  signer: RelaySigner,
  blobObjectId: string,
  ownerAddress: string
): Promise<void> => {
  const tx = new Transaction();
  tx.transferObjects([tx.object(blobObjectId)], ownerAddress);
  const digest = await executeWalrusTransaction(signer, tx);
  await signer.client.waitForTransaction({ digest });
};

const storeWithWalrusRelay = async (
  artifactPath: string,
  input: {
    walrusNetwork?: string;
    walrusUploadRelayUrl?: string;
    suiRpcUrl?: string;
    serverSuiPrivateKeys?: string[];
    metadata?: WalrusBlobMetadata;
    walrusOwnerAddress?: string;
  } & WalrusLogInput
): Promise<WalrusStoreResult> => {
  const epochs = envInt(process.env.OCTOPUS_WALRUS_EPOCHS, DEFAULT_WALRUS_EPOCHS);
  const signer = relaySigner(input);
  const network = normalizeWalrusNetwork(input.walrusNetwork ?? process.env.WALRUS_NETWORK);
  const relayUrl = (input.walrusUploadRelayUrl ?? process.env.WALRUS_UPLOAD_RELAY_URL ?? defaultRelayUrl(network))
    .replace(/\/+$/, "");
  logWalrusInfo(input, "relay.init", "walrus relay upload initialized", {
    epochs,
    network,
    relayUrl,
    signerAddress: signer.address,
    requestedOwnerAddress: input.walrusOwnerAddress
  });
  const walrus = relayClient({
    signer,
    walrusNetwork: input.walrusNetwork,
    walrusUploadRelayUrl: input.walrusUploadRelayUrl
  });
  const content = await runWalrusStep(input, "relay.read-artifact", () => readFile(artifactPath), {
    artifactPath
  });
  const flow = walrus.writeBlobFlow({
    blob: new Uint8Array(content)
  });

  await runWalrusStep(input, "relay.encode", () => flow.encode(), {
    artifactSizeBytes: content.byteLength
  });

  const attributes = input.metadata && Object.keys(input.metadata).length > 0 ? input.metadata : undefined;
  const registerDigest = await runWalrusStep(input, "relay.register", async () => {
    return await executeWalrusTransaction(
      signer,
      flow.register({
        epochs,
        owner: signer.address,
        deletable: true,
        attributes
      })
    );
  }, {
    attributeCount: attributes ? Object.keys(attributes).length : 0
  });
  await runWalrusStep(input, "relay.wait-register", () => signer.client.waitForTransaction({ digest: registerDigest }), {
    digest: registerDigest
  });

  await runWalrusStep(input, "relay.upload", () => flow.upload({ digest: registerDigest }), {
    digest: registerDigest,
    relayUrl
  });

  const certifyDigest = await runWalrusStep(input, "relay.certify", async () => {
    return await executeWalrusTransaction(signer, flow.certify());
  });
  await runWalrusStep(input, "relay.wait-certify", () => signer.client.waitForTransaction({ digest: certifyDigest }), {
    digest: certifyDigest
  });

  const blob = await runWalrusStep(input, "relay.get-blob", () => flow.getBlob());
  const rawBlobId = String(blob.blobId ?? "");
  const blobId = /^\d+$/.test(rawBlobId) ? blobIdFromInt(rawBlobId) : rawBlobId;
  const blobObjectId = objectIdString(blob.blobObject?.id);
  if (!blobId || !blobObjectId) {
    throw new Error("Walrus relay upload did not return blob metadata");
  }

  const finalOwner = isSuiAddress(input.walrusOwnerAddress) ? input.walrusOwnerAddress : signer.address;
  const ownershipTransferred = finalOwner !== signer.address;
  if (ownershipTransferred) {
    await runWalrusStep(input, "relay.transfer-owner", () => transferBlobObject(signer, blobObjectId, finalOwner), {
      blobObjectId,
      finalOwner
    });
  }

  logWalrusInfo(input, "relay.complete", "walrus relay upload completed", {
    blobId,
    blobObjectId,
    finalOwner,
    ownershipTransferred
  });

  return {
    blobId,
    blobObjectId,
    storageDurationEpochs: epochs,
    alreadyExisted: false,
    blobOwnerAddress: finalOwner,
    ownershipTransferred
  };
};

const readWithAggregator = async (
  blobId: string,
  outputPath: string,
  aggregatorUrl?: string
): Promise<void> => {
  const baseUrl = (aggregatorUrl ?? process.env.WALRUS_AGGREGATOR_URL ?? "").replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("WALRUS_AGGREGATOR_URL is not configured");
  }

  const response = await fetch(`${baseUrl}/v1/blobs/${encodeURIComponent(blobId)}`);
  if (!response.ok) {
    throw new Error(`Walrus aggregator read failed for ${blobId}: HTTP ${response.status}`);
  }

  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
};

export const storeArtifact = async (input: {
  dataDir: string;
  sourcePath: string;
  artifactDigest: string;
  metadata?: WalrusBlobMetadata;
  walrusNetwork?: string;
  walrusUploadRelayUrl?: string;
  suiRpcUrl?: string;
  serverSuiPrivateKeys?: string[];
  walrusOwnerAddress?: string;
} & WalrusLogInput): Promise<ArtifactStoreResult> => {
  const blobDir = join(input.dataDir, "walrus", "blobs");
  await mkdir(blobDir, { recursive: true });

  const storedArtifactPath = join(blobDir, `${input.artifactDigest}.bundle`);
  await copyFile(input.sourcePath, storedArtifactPath);
  logWalrusInfo(input, "artifact.copy", "artifact copied into walrus cache", {
    sourcePath: input.sourcePath,
    storedArtifactPath,
    artifactDigest: input.artifactDigest
  });
  if (input.metadata) {
    await writeFile(
      join(blobDir, `${input.artifactDigest}.metadata.json`),
      `${JSON.stringify(input.metadata, null, 2)}\n`
    );
    logWalrusInfo(input, "artifact.metadata", "artifact metadata written", {
      artifactDigest: input.artifactDigest,
      metadataKeys: Object.keys(input.metadata)
    });
  }

  const walrusMode = process.env.OCTOPUS_WALRUS_MODE;
  if (walrusMode === "cli") {
    const result = await storeWithWalrusCli(storedArtifactPath);
    return {
      blobId: result.blobId,
      blobObjectId: result.blobObjectId,
      storedArtifactPath,
      alreadyExisted: result.alreadyExisted,
      storageDurationEpochs: result.storageDurationEpochs,
      storageMode: "walrus-cli"
    };
  }

  if (walrusMode === "relay" || walrusMode === "walrus-relay" || walrusMode === "upload-relay") {
    const result = await storeWithWalrusRelay(storedArtifactPath, input);
    return {
      blobId: result.blobId,
      blobObjectId: result.blobObjectId,
      storedArtifactPath,
      alreadyExisted: result.alreadyExisted,
      storageDurationEpochs: result.storageDurationEpochs,
      storageMode: "walrus-relay",
      blobOwnerAddress: result.blobOwnerAddress,
      ownershipTransferred: result.ownershipTransferred
    };
  }

  return {
    blobId: `local:${input.artifactDigest}`,
    storedArtifactPath,
    alreadyExisted: false,
    storageDurationEpochs: 0,
    storageMode: "local"
  };
};

export const writeArtifactMetadata = async (input: {
  dataDir: string;
  artifactDigest: string;
  metadata: WalrusBlobMetadata;
}): Promise<void> => {
  const blobDir = join(input.dataDir, "walrus", "blobs");
  await mkdir(blobDir, { recursive: true });
  await writeFile(
    join(blobDir, `${input.artifactDigest}.metadata.json`),
    `${JSON.stringify(input.metadata, null, 2)}\n`
  );
};

export const readArtifact = async (input: {
  dataDir: string;
  blobId: string;
  artifactDigest: string;
  preferredPath?: string;
  walrusAggregatorUrl?: string;
}): Promise<ArtifactReadResult> => {
  const localPath = input.preferredPath ?? join(input.dataDir, "walrus", "blobs", `${input.artifactDigest}.bundle`);

  if (input.blobId.startsWith("local:")) {
    return {
      blobId: input.blobId,
      artifactPath: localPath,
      storageMode: "local"
    };
  }

  await mkdir(dirname(localPath), { recursive: true });

  if (input.walrusAggregatorUrl || process.env.WALRUS_AGGREGATOR_URL) {
    await readWithAggregator(input.blobId, localPath, input.walrusAggregatorUrl);

    return {
      blobId: input.blobId,
      artifactPath: localPath,
      storageMode: "walrus-aggregator"
    };
  }

  await runWalrus(["read", input.blobId, "--out", localPath]);

  return {
    blobId: input.blobId,
    artifactPath: localPath,
    storageMode: "walrus-cli"
  };
};
