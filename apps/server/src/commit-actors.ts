import { spawn } from "node:child_process";
import type { ServerConfig } from "./config.js";
import { readPushActors } from "./push-attempts.js";
import type { SuiRepoState } from "./sui.js";

export type CommitActorMap = Record<string, string>;

type GitResult = {
  stdout: Buffer;
  stderr: Buffer;
};

const runGit = async (args: string[]): Promise<GitResult> => {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn("git", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const result = {
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr)
      };

      if (code === 0) {
        resolvePromise(result);
        return;
      }

      reject(new Error(`git ${args.join(" ")} failed: ${result.stderr.toString()}`));
    });
  });
};

const readIntroducedCommits = async (
  repoPath: string,
  oldCommit: string | null,
  newCommit: string
): Promise<string[]> => {
  const args = ["--git-dir", repoPath, "rev-list", newCommit];
  if (oldCommit) {
    args.push(`^${oldCommit}`);
  }

  const result = await runGit(args);
  return result.stdout
    .toString("utf8")
    .split(/\r?\n/)
    .map((commit) => commit.trim())
    .filter(Boolean);
};

export const readCommitActors = async (
  config: ServerConfig,
  state: SuiRepoState,
  repoPath: string
): Promise<CommitActorMap> => {
  const pushActors = await readPushActors(config, state.owner, state.repo);
  const commitActors: CommitActorMap = {};

  for (const manifest of [...state.manifests].sort((a, b) => a.seq - b.seq)) {
    const actorWalletAddress =
      manifest.actorWalletAddress ??
      state.refs[manifest.refName]?.actorWalletAddress ??
      manifest.walrusMetadata.octopus_actor_wallet ??
      pushActors.get(manifest.manifestId) ??
      manifest.walrusBlobOwnerAddress;

    let introducedCommits: string[];
    try {
      introducedCommits = await readIntroducedCommits(repoPath, manifest.oldCommit, manifest.newCommit);
    } catch {
      introducedCommits = [manifest.newCommit];
    }

    if (!actorWalletAddress) {
      continue;
    }

    for (const commit of introducedCommits) {
      if (commitActors[commit]) {
        continue;
      }
      commitActors[commit] = actorWalletAddress;
    }
  }

  return commitActors;
};
