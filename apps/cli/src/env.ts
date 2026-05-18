import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const loadDotenv = (startDir = process.cwd()): void => {
  let dir = startDir;
  while (true) {
    const envPath = resolve(dir, ".env");
    if (existsSync(envPath)) {
      for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
          continue;
        }

        const separator = line.indexOf("=");
        if (separator <= 0) {
          continue;
        }

        const key = line.slice(0, separator).trim();
        if (process.env[key] !== undefined) {
          continue;
        }

        const rawValue = line.slice(separator + 1).trim();
        process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
      }
      return;
    }

    const parent = dirname(dir);
    if (parent === dir) {
      return;
    }
    dir = parent;
  }
};
