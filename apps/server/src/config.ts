import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { envInt } from "@ducnmm/octopus-shared";

const loadDotenv = (): void => {
  let dir = process.cwd();
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
        const rawValue = line.slice(separator + 1).trim();
        if (process.env[key] !== undefined) {
          continue;
        }

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

const walrusUploadRelayUrl = (network: string): string => {
  return network === "mainnet"
    ? "https://upload-relay.mainnet.walrus.space"
    : "https://upload-relay.testnet.walrus.space";
};

const walrusAggregatorUrl = (network: string): string => {
  return network === "mainnet"
    ? "https://aggregator.walrus-mainnet.walrus.space"
    : "https://aggregator.walrus-testnet.walrus.space";
};

const serverSuiPrivateKeys = (): string[] => {
  return (
    process.env.SERVER_SUI_PRIVATE_KEYS ??
    process.env.SERVER_ADMIN_PRIVATE_KEYS ??
    process.env.SERVER_SUI_PRIVATE_KEY ??
    process.env.SERVER_ADMIN_PRIVATE_KEY ??
    process.env.PUBLISHER_PRIVATE_KEY ??
    ""
  )
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
};

const sealKeyServers = (): string[] => {
  return (process.env.SEAL_KEY_SERVERS ?? process.env.OCTOPUS_SEAL_KEY_SERVERS ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
};

const defaultWebSessionSecret = (dataDir: string): string => {
  return createHash("sha256").update("octopus-web-session:").update(dataDir).digest("hex");
};

export type ServerConfig = {
  host: string;
  port: number;
  dataDir: string;
  repoRoot: string;
  webUrl: string;
  suiMode: "local" | "testnet";
  suiNetwork: string;
  suiRpcUrl: string;
  suiPackageId?: string;
  accountRegistryId?: string;
  repoRegistryId?: string;
  databaseUrl?: string;
  walrusNetwork: string;
  walrusUploadRelayUrl?: string;
  walrusAggregatorUrl?: string;
  serverSuiPrivateKeys: string[];
  sealMode: "local" | "seal";
  sealServerConfigs?: string;
  sealKeyServers: string[];
  sealThreshold?: number;
  webSessionSecret: string;
  delegateCacheTtlMs: number;
  enokiPrivateApiKey?: string;
  enokiApiUrl?: string;
};

export const loadConfig = (): ServerConfig => {
  loadDotenv();

  const dataDir = resolve(process.env.OCTOPUS_DATA_DIR ?? "./data");
  const walrusNetwork = process.env.WALRUS_NETWORK ?? process.env.NETWORK ?? "testnet";

  return {
    host: process.env.OCTOPUS_HOST ?? (process.env.RAILWAY_ENVIRONMENT ? "0.0.0.0" : "127.0.0.1"),
    port: envInt(process.env.OCTOPUS_PORT ?? process.env.PORT, 48787),
    dataDir,
    repoRoot: resolve(dataDir, "repos"),
    webUrl: process.env.OCTOPUS_WEB_URL ?? "http://127.0.0.1:45173",
    suiMode: process.env.OCTOPUS_SUI_MODE === "testnet" || process.env.SUI_NETWORK === "testnet" ? "testnet" : "local",
    suiNetwork: process.env.SUI_NETWORK ?? "localnet",
    suiRpcUrl:
      process.env.SUI_RPC_URL ??
      (process.env.SUI_NETWORK === "testnet"
        ? "https://fullnode.testnet.sui.io:443"
        : "http://127.0.0.1:9000"),
    suiPackageId: process.env.SUI_PACKAGE_ID || undefined,
    accountRegistryId: process.env.OCTOPUS_ACCOUNT_REGISTRY_ID || undefined,
    repoRegistryId: process.env.OCTOPUS_REPO_REGISTRY_ID || undefined,
    databaseUrl: process.env.DATABASE_URL || undefined,
    walrusNetwork,
    walrusUploadRelayUrl: process.env.WALRUS_UPLOAD_RELAY_URL || walrusUploadRelayUrl(walrusNetwork),
    walrusAggregatorUrl: process.env.WALRUS_AGGREGATOR_URL || walrusAggregatorUrl(walrusNetwork),
    serverSuiPrivateKeys: serverSuiPrivateKeys(),
    sealMode: process.env.OCTOPUS_SEAL_MODE === "seal" ? "seal" : "local",
    sealServerConfigs: process.env.SEAL_SERVER_CONFIGS || undefined,
    sealKeyServers: sealKeyServers(),
    sealThreshold: process.env.SEAL_THRESHOLD ? envInt(process.env.SEAL_THRESHOLD, 1) : undefined,
    webSessionSecret: process.env.OCTOPUS_WEB_SESSION_SECRET || defaultWebSessionSecret(dataDir),
    delegateCacheTtlMs: envInt(process.env.OCTOPUS_DELEGATE_CACHE_TTL_MS, 60_000),
    enokiPrivateApiKey:
      process.env.ENOKI_PRIVATE_API_KEY ||
      process.env.OCTOPUS_ENOKI_PRIVATE_API_KEY ||
      process.env.ENOKI_API_KEY ||
      undefined,
    enokiApiUrl: process.env.ENOKI_API_URL || process.env.OCTOPUS_ENOKI_API_URL || undefined
  };
};
