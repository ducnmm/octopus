import type { ServerConfig } from "../config/env.js";
import { readArtifact, storeArtifact, writeArtifactMetadata } from "../walrus.js";

type StoreInput = Omit<
  Parameters<typeof storeArtifact>[0],
  "dataDir" | "walrusNetwork" | "walrusUploadRelayUrl" | "suiRpcUrl" | "serverSuiPrivateKeys"
>;
type WriteMetadataInput = Omit<Parameters<typeof writeArtifactMetadata>[0], "dataDir">;
type ReadArtifactInput = Omit<Parameters<typeof readArtifact>[0], "dataDir" | "walrusAggregatorUrl">;

/**
 * Walrus blob storage (local fallback / CLI / relay). Config-derived fields are
 * supplied from `config`; callers pass only the business fields.
 */
export const createWalrusRepository = (config: ServerConfig) => ({
  store: (input: StoreInput) =>
    storeArtifact({
      ...input,
      dataDir: config.dataDir,
      walrusNetwork: config.walrusNetwork,
      walrusUploadRelayUrl: config.walrusUploadRelayUrl,
      suiRpcUrl: config.suiRpcUrl,
      serverSuiPrivateKeys: config.serverSuiPrivateKeys
    }),
  writeMetadata: (input: WriteMetadataInput) => writeArtifactMetadata({ ...input, dataDir: config.dataDir }),
  readArtifact: (input: ReadArtifactInput) =>
    readArtifact({ ...input, dataDir: config.dataDir, walrusAggregatorUrl: config.walrusAggregatorUrl })
});

export type WalrusRepository = ReturnType<typeof createWalrusRepository>;
