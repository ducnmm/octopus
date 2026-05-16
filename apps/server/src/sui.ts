import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PackManifest } from "./artifacts.js";
import type { ServerConfig } from "./config.js";

export type SuiRefState = {
  refName: string;
  commitDigest: string;
  manifestId: string;
  seq: number;
  updatedAtMs: number;
};

export type SuiRepoState = {
  registryMode: "local";
  repoObjectId: string;
  repoId: string;
  owner: string;
  repo: string;
  visibility: "public" | "private";
  defaultBranch: string;
  refs: Record<string, SuiRefState>;
  manifests: PackManifest[];
  createdAtMs: number;
  updatedAtMs: number;
};

export type SuiAnchorResult = {
  registryMode: "local";
  repoObjectId: string;
  manifestId: string;
  refName: string;
  commitDigest: string;
  seq: number;
};

const repoObjectId = (owner: string, repo: string): string => {
  const digest = createHash("sha256").update(`${owner}/${repo}`).digest("hex");
  return `local:${digest.slice(0, 40)}`;
};

const repoStatePath = (config: ServerConfig, owner: string, repo: string): string => {
  return join(config.dataDir, "sui", "repos", owner, `${repo}.json`);
};

const readRepoStateFile = async (
  config: ServerConfig,
  owner: string,
  repo: string
): Promise<SuiRepoState | null> => {
  try {
    const raw = await readFile(repoStatePath(config, owner, repo), "utf8");
    return JSON.parse(raw) as SuiRepoState;
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
  }
): Promise<SuiRepoState> => {
  const existing = await readRepoStateFile(config, input.owner, input.repo);
  if (existing) {
    return existing;
  }

  const now = Date.now();
  const state: SuiRepoState = {
    registryMode: "local",
    repoObjectId: repoObjectId(input.owner, input.repo),
    repoId: `${input.owner}/${input.repo}`,
    owner: input.owner,
    repo: input.repo,
    visibility: input.visibility,
    defaultBranch: "refs/heads/main",
    refs: {},
    manifests: [],
    createdAtMs: now,
    updatedAtMs: now
  };

  await writeRepoStateFile(config, state);
  return state;
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
  manifests: PackManifest[]
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

    const updatedAtMs = Date.now();
    state.refs[manifest.refName] = {
      refName: manifest.refName,
      commitDigest: manifest.newCommit,
      manifestId: manifest.manifestId,
      seq: manifest.seq,
      updatedAtMs
    };
    state.manifests = [...state.manifests, manifest].sort(
      (a, b) => a.seq - b.seq || a.manifestId.localeCompare(b.manifestId)
    );
    state.updatedAtMs = updatedAtMs;

    await writeRepoStateFile(config, state);
    results.push({
      registryMode: "local",
      repoObjectId: state.repoObjectId,
      manifestId: manifest.manifestId,
      refName: manifest.refName,
      commitDigest: manifest.newCommit,
      seq: manifest.seq
    });
  }

  return results;
};

export const readSuiRepoState = async (
  config: ServerConfig,
  owner: string,
  repo: string
): Promise<SuiRepoState | null> => {
  return await readRepoStateFile(config, owner, repo);
};

export const readSuiRepoManifests = async (
  config: ServerConfig,
  owner: string,
  repo: string
): Promise<PackManifest[]> => {
  const state = await readSuiRepoState(config, owner, repo);
  return state?.manifests ?? [];
};
