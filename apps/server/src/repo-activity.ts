import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ServerConfig } from "./config.js";
import { listPullRequests } from "./pull-requests.js";
import { readRepoManifests, type PackManifest } from "./artifacts.js";
import { readPushActors } from "./push-attempts.js";
import type { SuiRepoAccessAction, SuiRepoAccessRole, SuiRepoState } from "./sui.js";

export type RepoActivityKind = "access" | "pull_request" | "push" | "repo";

export type RepoActivityProof = {
  label: string;
  value: string;
  href?: string;
};

export type RepoActivityItem = {
  id: string;
  kind: RepoActivityKind;
  title: string;
  description: string;
  actorWalletAddress?: string;
  createdAtMs: number;
  href?: string;
  proof: RepoActivityProof[];
};

export type RepoAccessActivityRecord = {
  owner: string;
  repo: string;
  repoId: string;
  action: SuiRepoAccessAction;
  role: SuiRepoAccessRole;
  walletAddress: string;
  actorWalletAddress: string;
  txDigest?: string;
  createdAtMs: number;
};

const accessActivityPath = (config: ServerConfig, owner: string, repo: string): string => {
  return join(config.dataDir, "activity", owner, `${repo}.access.jsonl`);
};

const shortRef = (ref: string): string => {
  return ref.replace(/^refs\/heads\//, "").replace(/^refs\/tags\//, "");
};

const shortHash = (value: string): string => {
  return value.length > 12 ? value.slice(0, 8) : value;
};

const explorerNetwork = (config: ServerConfig): string | null => {
  return ["devnet", "testnet", "mainnet"].includes(config.suiNetwork) ? config.suiNetwork : null;
};

const suiExplorerTxHref = (config: ServerConfig, digest: string): string | undefined => {
  const network = explorerNetwork(config);
  return network ? `https://suiexplorer.com/txblock/${encodeURIComponent(digest)}?network=${network}` : undefined;
};

const suiExplorerObjectHref = (config: ServerConfig, objectId: string): string | undefined => {
  const network = explorerNetwork(config);
  return network ? `https://suiexplorer.com/object/${encodeURIComponent(objectId)}?network=${network}` : undefined;
};

const proof = (label: string, value: string | undefined, href?: string): RepoActivityProof[] => {
  return value ? [{ label, value, href }] : [];
};

export const recordRepoAccessActivity = async (
  config: ServerConfig,
  record: RepoAccessActivityRecord
): Promise<void> => {
  const path = accessActivityPath(config, record.owner, record.repo);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`);
};

const readRepoAccessActivity = async (
  config: ServerConfig,
  owner: string,
  repo: string
): Promise<RepoAccessActivityRecord[]> => {
  let raw: string;
  try {
    raw = await readFile(accessActivityPath(config, owner, repo), "utf8");
  } catch {
    return [];
  }

  const records: RepoAccessActivityRecord[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as Partial<RepoAccessActivityRecord>;
      if (
        parsed.owner === owner &&
        parsed.repo === repo &&
        parsed.repoId &&
        (parsed.action === "add" || parsed.action === "remove") &&
        (parsed.role === "reader" || parsed.role === "writer") &&
        parsed.walletAddress &&
        parsed.actorWalletAddress &&
        typeof parsed.createdAtMs === "number"
      ) {
        records.push(parsed as RepoAccessActivityRecord);
      }
    } catch {
      // Ignore malformed activity lines; the timeline should be best-effort.
    }
  }
  return records;
};

const manifestActivity = (
  config: ServerConfig,
  manifest: PackManifest,
  actorWalletAddress?: string
): RepoActivityItem => {
  const ref = shortRef(manifest.refName);
  const storage = manifest.encrypted ? `${manifest.storageMode}, encrypted` : manifest.storageMode;
  return {
    id: `push:${manifest.manifestId}`,
    kind: "push",
    title: `Pushed ${ref}`,
    description: `${shortHash(manifest.oldCommit ?? "root")} -> ${shortHash(manifest.newCommit)}`,
    actorWalletAddress: manifest.actorWalletAddress ?? actorWalletAddress,
    createdAtMs: manifest.createdAtMs,
    proof: [
      ...proof("Manifest", manifest.manifestId),
      ...proof("Commit", manifest.newCommit),
      ...proof("Walrus blob", manifest.walrusBlobId),
      ...proof(
        "Blob object",
        manifest.walrusBlobObjectId,
        manifest.walrusBlobObjectId ? suiExplorerObjectHref(config, manifest.walrusBlobObjectId) : undefined
      ),
      { label: "Storage", value: storage }
    ]
  };
};

export const listRepoActivity = async (
  config: ServerConfig,
  state: SuiRepoState,
  limit = 50
): Promise<RepoActivityItem[]> => {
  const manifests = await readRepoManifests(config.dataDir, state.owner, state.repo);
  const pushActors = await readPushActors(config, state.owner, state.repo);
  const pullRequests = await listPullRequests(config, state.owner, state.repo);
  const accessRecords = await readRepoAccessActivity(config, state.owner, state.repo);

  const items: RepoActivityItem[] = [
    {
      id: "repo:created",
      kind: "repo",
      title: "Created repository",
      description: state.visibility,
      actorWalletAddress: state.ownerWallet,
      createdAtMs: state.createdAtMs,
      proof: [
        ...proof("Repo object", state.repoObjectId, suiExplorerObjectHref(config, state.repoObjectId)),
        ...proof("Owner", state.ownerWallet)
      ]
    },
    ...manifests.map((manifest) => manifestActivity(config, manifest, pushActors.get(manifest.manifestId))),
    ...pullRequests.map(
      (pullRequest): RepoActivityItem => ({
        id: `pull_request:${pullRequest.number}`,
        kind: "pull_request",
        title: `Opened pull request #${pullRequest.number}`,
        description: `${shortRef(pullRequest.headRef)} into ${shortRef(pullRequest.baseRef)} · ${pullRequest.title}`,
        actorWalletAddress: pullRequest.authorWalletAddress,
        createdAtMs: pullRequest.createdAtMs,
        href: `/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.repo)}/pulls/${pullRequest.number}`,
        proof: [...proof("Base", pullRequest.baseCommit), ...proof("Head", pullRequest.headCommit)]
      })
    ),
    ...accessRecords.map((record): RepoActivityItem => {
      const action = record.action === "add" ? "granted" : "removed";
      const role = record.role === "reader" ? "Reader" : "Writer";
      return {
        id: `access:${record.createdAtMs}:${record.walletAddress}:${record.action}:${record.role}`,
        kind: "access",
        title: `${action === "granted" ? "Granted" : "Removed"} ${role} access`,
        description: `${action} ${record.walletAddress}`,
        actorWalletAddress: record.actorWalletAddress,
        createdAtMs: record.createdAtMs,
        proof: [
          ...proof(
            "Transaction",
            record.txDigest,
            record.txDigest ? suiExplorerTxHref(config, record.txDigest) : undefined
          ),
          ...proof("Contributor", record.walletAddress),
          ...proof("Role", role)
        ]
      };
    })
  ];

  return items
    .sort((left, right) => right.createdAtMs - left.createdAtMs || right.id.localeCompare(left.id))
    .slice(0, limit);
};
