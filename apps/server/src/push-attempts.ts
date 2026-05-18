import { appendFile, mkdir } from "node:fs/promises";
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
