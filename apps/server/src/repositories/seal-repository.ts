import type { ServerConfig } from "../config/env.js";
import { decryptArtifactForRepo, encryptArtifactForRepo, sealKeyIdForRepo } from "../seal.js";

type EncryptInput = Omit<
  Parameters<typeof encryptArtifactForRepo>[0],
  "packageId" | "sealMode" | "suiRpcUrl" | "suiNetwork" | "sealServerConfigs" | "sealKeyServers" | "sealThreshold"
>;
type DecryptInput = Omit<
  Parameters<typeof decryptArtifactForRepo>[0],
  "serverSuiPrivateKey" | "suiRpcUrl" | "suiNetwork" | "sealServerConfigs" | "sealKeyServers" | "sealThreshold"
>;

/**
 * Private-artifact encryption (local deterministic seal / SEAL key servers).
 * Config-derived fields are supplied from `config`; callers pass business fields.
 */
export const createSealRepository = (config: ServerConfig) => ({
  keyIdForRepo: sealKeyIdForRepo,
  encrypt: (input: EncryptInput) =>
    encryptArtifactForRepo({
      ...input,
      packageId: config.suiPackageId,
      sealMode: config.sealMode,
      suiRpcUrl: config.suiRpcUrl,
      suiNetwork: config.suiNetwork,
      sealServerConfigs: config.sealServerConfigs,
      sealKeyServers: config.sealKeyServers,
      sealThreshold: config.sealThreshold
    }),
  decrypt: (input: DecryptInput) =>
    decryptArtifactForRepo({
      ...input,
      serverSuiPrivateKey: config.serverSuiPrivateKeys[0],
      suiRpcUrl: config.suiRpcUrl,
      suiNetwork: config.suiNetwork,
      sealServerConfigs: config.sealServerConfigs,
      sealKeyServers: config.sealKeyServers,
      sealThreshold: config.sealThreshold
    })
});

export type SealRepository = ReturnType<typeof createSealRepository>;
