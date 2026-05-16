import { resolve } from "node:path";
import { envInt } from "@octopus/shared";

export type ServerConfig = {
  host: string;
  port: number;
  dataDir: string;
  repoRoot: string;
  suiMode: "local";
  suiNetwork: string;
  suiPackageId?: string;
};

export const loadConfig = (): ServerConfig => {
  const dataDir = resolve(process.env.OCTOPUS_DATA_DIR ?? "./data");

  return {
    host: process.env.OCTOPUS_HOST ?? "127.0.0.1",
    port: envInt(process.env.OCTOPUS_PORT, 8787),
    dataDir,
    repoRoot: resolve(dataDir, "repos"),
    suiMode: "local",
    suiNetwork: process.env.SUI_NETWORK ?? "localnet",
    suiPackageId: process.env.SUI_PACKAGE_ID || undefined
  };
};
