import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { keypairFromPrivateKey, type AuthContext } from "./auth.js";
import { readRepoManifests, type PackManifest } from "./artifacts.js";
import type { ServerConfig } from "./config.js";
import { httpError } from "./lib/http-error.js";

export type SuiRefState = {
  refName: string;
  commitDigest: string;
  manifestId: string;
  actorWalletAddress?: string;
  seq: number;
  updatedAtMs: number;
};

export type SuiRepoState = {
  registryMode: "local" | "testnet";
  repoObjectId: string;
  repoId: string;
  owner: string;
  ownerWallet: string;
  accountId?: string;
  repo: string;
  visibility: "public" | "private";
  defaultBranch: string;
  refs: Record<string, SuiRefState>;
  manifests: PackManifest[];
  readers: string[];
  writers: string[];
  createdAtMs: number;
  updatedAtMs: number;
};

export type SuiAnchorResult = {
  registryMode: "local" | "testnet";
  repoObjectId: string;
  manifestId: string;
  refName: string;
  commitDigest: string;
  seq: number;
};

export type SuiManifestSource = "sui-local" | "sui-testnet";

export type SuiManifestReadResult = {
  manifests: PackManifest[];
  source: SuiManifestSource;
};

export type SuiRepoStateAuthorizationResult = {
  state: SuiRepoState | null;
  source: SuiManifestSource;
  authoritative: boolean;
  error?: Error;
};

export type SuiRepoAccessRole = "reader" | "writer";
export type SuiRepoAccessAction = "add" | "remove";

const repoObjectId = (owner: string, repo: string): string => {
  const digest = createHash("sha256").update(`${owner}/${repo}`).digest("hex");
  return `local:${digest.slice(0, 40)}`;
};

const repoStatePath = (config: ServerConfig, owner: string, repo: string): string => {
  return join(config.dataDir, "sui", "repos", owner, `${repo}.json`);
};

const fieldsAsRecord = (value: unknown): Record<string, unknown> => {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
};

const moveFields = (value: unknown): Record<string, unknown> => {
  const fields = fieldsAsRecord(value).fields;
  return fieldsAsRecord(fields);
};

const tableId = (value: unknown): string => {
  const fields = moveFields(value);
  const id = fieldsAsRecord(fields.id).id;
  return typeof id === "string" ? id : "";
};

const asString = (value: unknown): string => {
  return typeof value === "string" ? value : "";
};

const asNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  }

  return fallback;
};

const visibilityFromCode = (value: unknown): "public" | "private" => {
  return asNumber(value) === 1 ? "private" : "public";
};

const allDynamicFields = async (
  client: SuiJsonRpcClient,
  parentId: string
): Promise<Array<{ name: { type: string; value: unknown }; objectId: string }>> => {
  const fields: Array<{ name: { type: string; value: unknown }; objectId: string }> = [];
  let cursor: string | null | undefined;

  do {
    const page = await client.getDynamicFields({
      parentId,
      cursor,
      limit: 50
    });
    fields.push(
      ...page.data.map((field) => ({
        name: field.name,
        objectId: field.objectId
      }))
    );
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);

  return fields;
};

const dynamicFieldValue = async (
  client: SuiJsonRpcClient,
  parentId: string,
  name: { type: string; value: unknown }
): Promise<Record<string, unknown> | null> => {
  try {
    const object = await client.getDynamicFieldObject({ parentId, name });
    const fields = moveFields(object.data?.content);
    const value = fields.value;
    const nested = moveFields(value);
    return Object.keys(nested).length > 0 ? nested : fieldsAsRecord(value);
  } catch {
    return null;
  }
};

const readRepoStateFile = async (config: ServerConfig, owner: string, repo: string): Promise<SuiRepoState | null> => {
  try {
    const raw = await readFile(repoStatePath(config, owner, repo), "utf8");
    const state = JSON.parse(raw) as SuiRepoState;
    state.ownerWallet ??= state.owner;
    state.readers ??= [];
    state.writers ??= [];
    return state;
  } catch {
    return null;
  }
};

const writeRepoStateFile = async (config: ServerConfig, state: SuiRepoState): Promise<void> => {
  const path = repoStatePath(config, state.owner, state.repo);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`);
};

export const ensureSuiRepo = async (
  config: ServerConfig,
  input: {
    owner: string;
    repo: string;
    visibility: "public" | "private";
    ownerWallet?: string;
    accountId?: string;
  },
  auth?: AuthContext | null
): Promise<SuiRepoState> => {
  const existing = await readRepoStateFile(config, input.owner, input.repo);
  if (existing) {
    return existing;
  }

  const nextRepoObjectId =
    config.suiMode === "testnet" ? await createTestnetRepo(config, input, auth) : repoObjectId(input.owner, input.repo);

  const now = Date.now();
  const state: SuiRepoState = {
    registryMode: config.suiMode,
    repoObjectId: nextRepoObjectId,
    repoId: `${input.owner}/${input.repo}`,
    owner: input.owner,
    ownerWallet: input.ownerWallet ?? auth?.walletAddress ?? input.owner,
    accountId: input.accountId ?? auth?.accountId,
    repo: input.repo,
    visibility: input.visibility,
    defaultBranch: "refs/heads/main",
    refs: {},
    manifests: [],
    readers: [],
    writers: [],
    createdAtMs: now,
    updatedAtMs: now
  };

  await writeRepoStateFile(config, state);
  return state;
};

const visibilityCode = (visibility: "public" | "private"): number => {
  return visibility === "private" ? 1 : 0;
};

const asSuiObjectId = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }
  try {
    const normalized = normalizeSuiAddress(value);
    return isValidSuiAddress(normalized) ? normalized : null;
  } catch {
    return null;
  }
};

const resolveAccountObjectId = async (config: ServerConfig, walletAddress: string): Promise<string | null> => {
  if (!config.accountRegistryId) {
    return null;
  }

  const client = new SuiJsonRpcClient({ url: config.suiRpcUrl, network: config.suiNetwork as "testnet" });
  const registry = await client.getObject({ id: config.accountRegistryId, options: { showContent: true } });
  const accountsTableId = tableId(moveFields(registry.data?.content).accounts);
  if (!accountsTableId) {
    return null;
  }

  try {
    const entry = await client.getDynamicFieldObject({
      parentId: accountsTableId,
      name: { type: "address", value: walletAddress }
    });
    return asSuiObjectId(asString(moveFields(entry.data?.content).value));
  } catch {
    return null;
  }
};

/**
 * Web sessions fall back to a synthetic `web:<hash>` account id when the login
 * flow could not resolve the on-chain Account object (e.g. the session predates
 * the testnet registry config). Testnet transactions need the real object id,
 * so resolve it from the account registry by wallet address before signing.
 */
const requireAccountObjectId = async (
  config: ServerConfig,
  auth: AuthContext,
  explicitAccountId?: string
): Promise<string> => {
  const direct = asSuiObjectId(explicitAccountId) ?? asSuiObjectId(auth.accountId);
  if (direct) {
    return direct;
  }

  const walletAddress = asSuiObjectId(auth.walletAddress);
  const resolved = walletAddress ? await resolveAccountObjectId(config, walletAddress) : null;
  if (resolved) {
    return resolved;
  }

  throw httpError(
    `No on-chain Octopus account found for wallet ${auth.walletAddress}. Sign out and sign in again with your wallet, then retry.`,
    400
  );
};

const testnetTransactionSigner = (config: ServerConfig, auth?: AuthContext | null): Ed25519Keypair => {
  const privateKey = config.serverSuiPrivateKeys[0] ?? auth?.delegatePrivateKey;
  if (!privateKey) {
    throw new Error(
      "SERVER_SUI_PRIVATE_KEYS is required for testnet Sui transactions. Register the server key as an account delegate during login."
    );
  }

  return keypairFromPrivateKey(privateKey);
};

const createTestnetRepo = async (
  config: ServerConfig,
  input: {
    owner: string;
    repo: string;
    visibility: "public" | "private";
    accountId?: string;
  },
  auth?: AuthContext | null
): Promise<string> => {
  if (!auth) {
    throw new Error("Sui testnet repo creation requires delegate auth");
  }

  if (!config.suiPackageId || !config.repoRegistryId) {
    throw new Error("SUI_PACKAGE_ID and OCTOPUS_REPO_REGISTRY_ID are required for testnet repo creation");
  }

  const accountObjectId = await requireAccountObjectId(config, auth, input.accountId);
  const tx = new Transaction();
  tx.moveCall({
    target: `${config.suiPackageId}::registry::create_repo`,
    arguments: [
      tx.object(config.repoRegistryId),
      tx.object(accountObjectId),
      tx.pure.string(`${input.owner}/${input.repo}`),
      tx.pure.string(input.repo),
      tx.pure.u8(visibilityCode(input.visibility)),
      tx.pure.string("refs/heads/main")
    ]
  });

  const client = new SuiJsonRpcClient({ url: config.suiRpcUrl, network: config.suiNetwork as "testnet" });
  const result = await client.signAndExecuteTransaction({
    signer: testnetTransactionSigner(config, auth),
    transaction: tx,
    options: {
      showEffects: true,
      showObjectChanges: true
    }
  });

  const error = result.effects?.status.status === "failure" ? result.effects.status.error : undefined;
  if (error) {
    throw new Error(`Sui create_repo failed: ${error}`);
  }

  // Wait until the fullnode has indexed the transaction so the registry lookup
  // on the very next request (e.g. the post-create redirect) can see the repo.
  await client.waitForTransaction({ digest: result.digest });

  const repoObject = result.objectChanges?.find(
    (change: { type: string; objectType?: string; objectId?: string }) =>
      change.type === "created" && "objectType" in change && String(change.objectType).endsWith("::registry::Repo")
  );
  if (!repoObject || !("objectId" in repoObject)) {
    throw new Error("Sui create_repo did not return a Repo object ID");
  }

  return String(repoObject.objectId);
};

const assertExpectedOldCommit = (state: SuiRepoState, manifest: PackManifest): void => {
  const current = state.refs[manifest.refName];
  const currentCommit = current?.commitDigest ?? null;
  if (currentCommit !== manifest.oldCommit) {
    throw new Error(
      `Sui ref mismatch for ${state.repoId} ${manifest.refName}: expected old commit ${currentCommit}, manifest has ${manifest.oldCommit}`
    );
  }
};

export const anchorPushManifests = async (
  config: ServerConfig,
  manifests: PackManifest[],
  auth?: AuthContext | null
): Promise<SuiAnchorResult[]> => {
  const results: SuiAnchorResult[] = [];

  for (const manifest of manifests) {
    const state =
      (await readRepoStateFile(config, manifest.owner, manifest.repo)) ??
      (await ensureSuiRepo(config, {
        owner: manifest.owner,
        repo: manifest.repo,
        visibility: "public"
      }));

    assertExpectedOldCommit(state, manifest);

    if (config.suiMode === "testnet") {
      await pushRefOnTestnet(config, state, manifest, auth);
    }

    const actorWalletAddress = manifest.actorWalletAddress ?? auth?.walletAddress;
    const anchoredManifest: PackManifest = actorWalletAddress
      ? {
          ...manifest,
          actorWalletAddress,
          walrusMetadata: {
            ...manifest.walrusMetadata,
            octopus_actor_wallet: actorWalletAddress
          }
        }
      : manifest;
    const updatedAtMs = Date.now();
    state.refs[manifest.refName] = {
      refName: manifest.refName,
      commitDigest: manifest.newCommit,
      manifestId: manifest.manifestId,
      actorWalletAddress,
      seq: manifest.seq,
      updatedAtMs
    };
    state.manifests = [...state.manifests, anchoredManifest].sort(
      (a, b) => a.seq - b.seq || a.manifestId.localeCompare(b.manifestId)
    );
    state.updatedAtMs = updatedAtMs;

    await writeRepoStateFile(config, state);
    results.push({
      registryMode: state.registryMode,
      repoObjectId: state.repoObjectId,
      manifestId: manifest.manifestId,
      refName: manifest.refName,
      commitDigest: manifest.newCommit,
      seq: manifest.seq
    });
  }

  return results;
};

const pushRefOnTestnet = async (
  config: ServerConfig,
  state: SuiRepoState,
  manifest: PackManifest,
  auth?: AuthContext | null
): Promise<void> => {
  if (!auth) {
    throw new Error("Sui testnet push_ref requires delegate auth");
  }

  if (!config.suiPackageId) {
    throw new Error("SUI_PACKAGE_ID is required for testnet push_ref");
  }

  const accountObjectId = await requireAccountObjectId(config, auth);
  const onchainMetadata = JSON.stringify({
    v: 1,
    localManifestId: manifest.manifestId,
    visibility: manifest.visibility,
    encrypted: manifest.encrypted,
    storedArtifactDigest: manifest.storedArtifactDigest ?? manifest.artifactDigest,
    storageMode: manifest.storageMode,
    walrusBlobOwnerAddress: manifest.walrusBlobOwnerAddress,
    walrusOwnershipTransferred: manifest.walrusOwnershipTransferred ?? false,
    actorWalletAddress: manifest.actorWalletAddress ?? auth?.walletAddress,
    sealEnvelope: manifest.sealEnvelope ?? null
  });
  const tx = new Transaction();
  tx.moveCall({
    target: `${config.suiPackageId}::registry::push_ref`,
    arguments: [
      tx.object(state.repoObjectId),
      tx.object(accountObjectId),
      tx.pure.string(manifest.refName),
      tx.pure.string(manifest.oldCommit ?? ""),
      tx.pure.string(manifest.newCommit),
      tx.pure.string(manifest.walrusBlobId),
      tx.pure.string(manifest.walrusBlobObjectId ?? ""),
      tx.pure.string(manifest.artifactDigest),
      tx.pure.u64(BigInt(manifest.artifactSizeBytes)),
      tx.pure.string(onchainMetadata),
      tx.pure.string(""),
      tx.pure.bool(manifest.isSnapshot)
    ]
  });

  const client = new SuiJsonRpcClient({ url: config.suiRpcUrl, network: config.suiNetwork as "testnet" });
  const result = await client.signAndExecuteTransaction({
    signer: testnetTransactionSigner(config, auth),
    transaction: tx,
    options: { showEffects: true }
  });
  const error = result.effects?.status.status === "failure" ? result.effects.status.error : undefined;
  if (error) {
    throw new Error(`Sui push_ref failed: ${error}`);
  }
};

export const canReadRepo = (state: SuiRepoState, auth?: AuthContext | null): boolean => {
  if (state.visibility === "public") {
    return true;
  }

  if (!auth) {
    return false;
  }

  return (
    auth.walletAddress === state.ownerWallet ||
    auth.walletAddress === state.owner ||
    (state.writers ?? []).includes(auth.walletAddress) ||
    (state.readers ?? []).includes(auth.walletAddress)
  );
};

export const canWriteRepo = (state: SuiRepoState, auth?: AuthContext | null): boolean => {
  if (!auth) {
    return false;
  }

  return (
    auth.walletAddress === state.ownerWallet ||
    auth.walletAddress === state.owner ||
    (state.writers ?? []).includes(auth.walletAddress)
  );
};

export const canManageRepoAccess = (state: SuiRepoState, auth?: AuthContext | null): boolean => {
  if (!auth) {
    return false;
  }

  const walletAddress = auth.walletAddress.toLowerCase();
  return walletAddress === state.ownerWallet.toLowerCase() || walletAddress === state.owner.toLowerCase();
};

const uniqueAddresses = (addresses: string[]): string[] => {
  return [...new Set(addresses.map((address) => address.trim().toLowerCase()).filter(Boolean))].sort();
};

export const updateSuiRepoAccess = async (
  config: ServerConfig,
  state: SuiRepoState,
  input: {
    walletAddress: string;
    role: SuiRepoAccessRole;
    action: SuiRepoAccessAction;
  }
): Promise<SuiRepoState> => {
  if (state.registryMode === "testnet" || config.suiMode === "testnet") {
    throw new Error("Contributor management from the web UI is currently supported for local registry mode only");
  }

  const walletAddress = input.walletAddress.trim().toLowerCase();
  const readers = new Set(uniqueAddresses(state.readers ?? []));
  const writers = new Set(uniqueAddresses(state.writers ?? []));

  if (input.action === "add") {
    if (input.role === "writer") {
      writers.add(walletAddress);
      readers.delete(walletAddress);
    } else if (!writers.has(walletAddress)) {
      readers.add(walletAddress);
    }
  } else if (input.role === "writer") {
    writers.delete(walletAddress);
  } else {
    readers.delete(walletAddress);
  }

  const updated: SuiRepoState = {
    ...state,
    readers: [...readers].sort(),
    writers: [...writers].sort(),
    updatedAtMs: Date.now()
  };
  await writeRepoStateFile(config, updated);
  return updated;
};

const testnetClient = (config: ServerConfig): SuiJsonRpcClient => {
  return new SuiJsonRpcClient({ url: config.suiRpcUrl, network: config.suiNetwork as "testnet" });
};

const resolveTestnetRepoObjectId = async (
  config: ServerConfig,
  client: SuiJsonRpcClient,
  owner: string,
  repo: string
): Promise<string | null> => {
  if (!config.repoRegistryId) {
    return null;
  }

  const registry = await client.getObject({
    id: config.repoRegistryId,
    options: { showContent: true }
  });
  const reposTableId = tableId(moveFields(registry.data?.content).repos);
  if (!reposTableId) {
    return null;
  }

  try {
    const entry = await client.getDynamicFieldObject({
      parentId: reposTableId,
      name: { type: "0x1::string::String", value: `${owner}/${repo}` }
    });
    const value = moveFields(entry.data?.content).value;
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
};

const readTestnetRefs = async (client: SuiJsonRpcClient, refsTableId: string): Promise<Record<string, SuiRefState>> => {
  if (!refsTableId) {
    return {};
  }

  const refs: Record<string, SuiRefState> = {};
  for (const field of await allDynamicFields(client, refsTableId)) {
    const value = await dynamicFieldValue(client, refsTableId, field.name);
    if (!value) {
      continue;
    }

    const refName = asString(field.name.value);
    if (!refName) {
      continue;
    }

    refs[refName] = {
      refName,
      commitDigest: asString(value.commit_digest),
      manifestId: asString(value.manifest_id),
      seq: asNumber(value.seq),
      updatedAtMs: asNumber(value.updated_at_ms)
    };
  }

  return refs;
};

const readAddressTableKeys = async (client: SuiJsonRpcClient, tableObjectId: string): Promise<string[]> => {
  if (!tableObjectId) {
    return [];
  }

  return (await allDynamicFields(client, tableObjectId)).map((field) => asString(field.name.value)).filter(Boolean);
};

const parseOnchainMetadata = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "string" || !value.trim().startsWith("{")) {
    return {};
  }

  try {
    return fieldsAsRecord(JSON.parse(value));
  } catch {
    return {};
  }
};

const localManifestKey = (manifest: PackManifest): string => {
  return [manifest.refName, manifest.newCommit, manifest.artifactDigest, String(manifest.seq)].join("\0");
};

const localManifestShortKey = (manifest: Pick<PackManifest, "refName" | "newCommit" | "seq">): string => {
  return [manifest.refName, manifest.newCommit, String(manifest.seq)].join("\0");
};

const localManifestLookup = async (
  config: ServerConfig,
  owner: string,
  repo: string
): Promise<{
  byFullKey: Map<string, PackManifest>;
  byShortKey: Map<string, PackManifest>;
}> => {
  const localManifests = await readRepoManifests(config.dataDir, owner, repo);
  return {
    byFullKey: new Map(localManifests.map((manifest) => [localManifestKey(manifest), manifest])),
    byShortKey: new Map(localManifests.map((manifest) => [localManifestShortKey(manifest), manifest]))
  };
};

const readTestnetRepoManifests = async (
  config: ServerConfig,
  client: SuiJsonRpcClient,
  input: {
    owner: string;
    repo: string;
    repoId: string;
    repoObjectId: string;
    visibility: "public" | "private";
    manifestsTableId: string;
  }
): Promise<PackManifest[]> => {
  if (!input.manifestsTableId) {
    return [];
  }

  const localByKey = await localManifestLookup(config, input.owner, input.repo);
  const manifests: PackManifest[] = [];

  for (const field of await allDynamicFields(client, input.manifestsTableId)) {
    const value = await dynamicFieldValue(client, input.manifestsTableId, field.name);
    if (!value) {
      continue;
    }

    const metadata = parseOnchainMetadata(value.base_manifest_id);
    const artifactDigest = asString(value.artifact_digest);
    const storedArtifactDigest = asString(metadata.storedArtifactDigest) || undefined;
    const artifactCacheDigest = storedArtifactDigest ?? artifactDigest;
    const seq = asNumber(value.seq);
    const refName = asString(value.ref_name);
    const newCommit = asString(value.new_commit);
    const manifest: PackManifest = {
      manifestId: asString(value.manifest_id),
      actorWalletAddress:
        asString(metadata.actorWalletAddress) ||
        asString(metadata.octopus_actor_wallet) ||
        asString(metadata.actorWallet) ||
        undefined,
      repoId: input.repoId,
      owner: input.owner,
      repo: input.repo,
      refName,
      oldCommit: asString(value.old_commit) || null,
      newCommit,
      walrusBlobId: asString(value.walrus_blob_id),
      walrusBlobObjectId: asString(value.walrus_blob_object_id) || undefined,
      artifactDigest,
      storedArtifactDigest,
      artifactSizeBytes: asNumber(value.artifact_size_bytes),
      artifactPath: join(config.dataDir, "walrus", "blobs", `${artifactCacheDigest}.bundle`),
      storageMode: asString(metadata.storageMode) === "local" ? "local" : "walrus-relay",
      walrusBlobOwnerAddress: asString(metadata.walrusBlobOwnerAddress) || undefined,
      walrusOwnershipTransferred: metadata.walrusOwnershipTransferred === true,
      visibility: asString(metadata.visibility) === "private" ? "private" : input.visibility,
      encrypted: typeof metadata.encrypted === "boolean" ? metadata.encrypted : input.visibility === "private",
      sealEnvelope: fieldsAsRecord(metadata.sealEnvelope) as PackManifest["sealEnvelope"],
      walrusMetadata: {
        octopus_repo_id: input.repoId,
        octopus_repo_object_id: input.repoObjectId,
        octopus_owner: input.owner,
        octopus_ref: refName,
        octopus_manifest_id: asString(metadata.localManifestId) || asString(value.manifest_id),
        ...(asString(metadata.actorWalletAddress) || asString(metadata.octopus_actor_wallet)
          ? { octopus_actor_wallet: asString(metadata.actorWalletAddress) || asString(metadata.octopus_actor_wallet) }
          : {}),
        octopus_seq: String(seq),
        octopus_artifact_digest: artifactDigest,
        octopus_visibility: input.visibility,
        octopus_package_id: config.suiPackageId ?? ""
      },
      isSnapshot: Boolean(value.is_snapshot),
      createdAtMs: asNumber(value.created_at_ms),
      seq
    };

    const local =
      localByKey.byFullKey.get(localManifestKey(manifest)) ??
      localByKey.byShortKey.get(localManifestShortKey(manifest));
    const mergedStoredArtifactDigest = manifest.storedArtifactDigest || local?.storedArtifactDigest;
    manifests.push({
      ...manifest,
      actorWalletAddress: manifest.actorWalletAddress || local?.actorWalletAddress,
      storedArtifactDigest: mergedStoredArtifactDigest,
      sealEnvelope: manifest.sealEnvelope?.mode ? manifest.sealEnvelope : local?.sealEnvelope,
      encrypted: manifest.encrypted || local?.encrypted === true,
      artifactPath:
        local?.artifactPath ??
        join(config.dataDir, "walrus", "blobs", `${mergedStoredArtifactDigest ?? artifactDigest}.bundle`),
      storageMode: manifest.storageMode ?? local?.storageMode ?? "walrus-relay"
    });
  }

  return manifests.sort((a, b) => a.seq - b.seq || a.manifestId.localeCompare(b.manifestId));
};

const readTestnetRepoState = async (
  config: ServerConfig,
  owner: string,
  repo: string
): Promise<SuiRepoState | null> => {
  if (config.suiMode !== "testnet") {
    return null;
  }

  const client = testnetClient(config);
  // The registry's dynamic-field index can lag a freshly executed create_repo;
  // fall back to the repo object id recorded in the local mirror at creation.
  const mirroredObjectId = (await readRepoStateFile(config, owner, repo))?.repoObjectId;
  const repoObjectId =
    (await resolveTestnetRepoObjectId(config, client, owner, repo)) ??
    (mirroredObjectId?.startsWith("0x") ? mirroredObjectId : null);
  if (!repoObjectId) {
    return null;
  }

  const object = await client.getObject({
    id: repoObjectId,
    options: { showContent: true }
  });
  if (!object.data) {
    return null;
  }
  const fields = moveFields(object.data.content);
  const repoId = asString(fields.repo_id) || `${owner}/${repo}`;
  const visibility = visibilityFromCode(fields.visibility);
  const refsTableId = tableId(fields.refs);
  const manifestsTableId = tableId(fields.manifests);
  const updatedAtMs = Date.now();

  return {
    registryMode: "testnet",
    repoObjectId,
    repoId,
    owner,
    ownerWallet: asString(fields.owner),
    repo,
    visibility,
    defaultBranch: asString(fields.default_branch) || "refs/heads/main",
    refs: await readTestnetRefs(client, refsTableId),
    manifests: await readTestnetRepoManifests(config, client, {
      owner,
      repo,
      repoId,
      repoObjectId,
      visibility,
      manifestsTableId
    }),
    readers: await readAddressTableKeys(client, tableId(fields.readers)),
    writers: await readAddressTableKeys(client, tableId(fields.writers)),
    createdAtMs: asNumber(fields.created_at_ms),
    updatedAtMs
  };
};

export const readSuiRepoState = async (
  config: ServerConfig,
  owner: string,
  repo: string
): Promise<SuiRepoState | null> => {
  return (await readSuiRepoStateForAuthorization(config, owner, repo)).state;
};

export const readSuiRepoStateForAuthorization = async (
  config: ServerConfig,
  owner: string,
  repo: string
): Promise<SuiRepoStateAuthorizationResult> => {
  if (config.suiMode === "testnet") {
    try {
      const state = await readTestnetRepoState(config, owner, repo);
      if (state) {
        return {
          state,
          source: "sui-testnet",
          authoritative: true
        };
      }
      return {
        state: null,
        source: "sui-testnet",
        authoritative: true
      };
    } catch (error) {
      // Fall back to the local mirror if the testnet RPC is temporarily unavailable.
      return {
        state: await readRepoStateFile(config, owner, repo),
        source: "sui-local",
        authoritative: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  return {
    state: await readRepoStateFile(config, owner, repo),
    source: "sui-local",
    authoritative: true
  };
};

export const listSuiRepoStates = async (config: ServerConfig): Promise<SuiRepoState[]> => {
  const root = join(config.dataDir, "sui", "repos");

  try {
    const owners = await readdir(root, { withFileTypes: true });
    const states: SuiRepoState[] = [];

    for (const ownerEntry of owners) {
      if (!ownerEntry.isDirectory()) {
        continue;
      }

      const owner = ownerEntry.name;
      const repos = await readdir(join(root, owner), { withFileTypes: true });
      for (const repoEntry of repos) {
        if (!repoEntry.isFile() || !repoEntry.name.endsWith(".json")) {
          continue;
        }

        const repo = repoEntry.name.slice(0, -".json".length);
        const state = await readRepoStateFile(config, owner, repo);
        if (state) {
          states.push(state);
        }
      }
    }

    return states.sort((a, b) => b.updatedAtMs - a.updatedAtMs || a.repoId.localeCompare(b.repoId));
  } catch {
    return [];
  }
};

export const readSuiRepoManifests = async (
  config: ServerConfig,
  owner: string,
  repo: string
): Promise<PackManifest[]> => {
  return (await readSuiRepoManifestsWithSource(config, owner, repo)).manifests;
};

export const readSuiRepoManifestsWithSource = async (
  config: ServerConfig,
  owner: string,
  repo: string
): Promise<SuiManifestReadResult> => {
  if (config.suiMode === "testnet") {
    try {
      const state = await readTestnetRepoState(config, owner, repo);
      if (state) {
        return {
          manifests: state.manifests,
          source: "sui-testnet"
        };
      }
    } catch {
      // Fall back to the local mirror if the testnet RPC is temporarily unavailable.
    }
  }

  const state = await readRepoStateFile(config, owner, repo);
  return {
    manifests: state?.manifests ?? [],
    source: "sui-local"
  };
};
