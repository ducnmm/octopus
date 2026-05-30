import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ServerConfig } from "./config.js";

export type PushAttempt = {
  owner: string;
  repo: string;
  status: "completed" | "failed";
  manifestIds?: string[];
  actor?: string;
  error?: string;
  createdAtMs: number;
};

export const recordPushAttempt = async (
  config: ServerConfig,
  attempt: PushAttempt
): Promise<void> => {
  const path = join(config.dataDir, "push_attempts.jsonl");
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(attempt)}\n`);
};

export const readPushActors = async (
  config: ServerConfig,
  owner: string,
  repo: string
): Promise<Map<string, string>> => {
  const path = join(config.dataDir, "push_attempts.jsonl");
  const actorsByManifestId = new Map<string, string>();

  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return actorsByManifestId;
  }

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    let attempt: PushAttempt;
    try {
      attempt = JSON.parse(line) as PushAttempt;
    } catch {
      continue;
    }

    if (
      attempt.owner !== owner ||
      attempt.repo !== repo ||
      attempt.status !== "completed" ||
      !attempt.actor ||
      !Array.isArray(attempt.manifestIds)
    ) {
      continue;
    }

    for (const manifestId of attempt.manifestIds) {
      actorsByManifestId.set(manifestId, attempt.actor);
    }
  }

  return actorsByManifestId;
};
