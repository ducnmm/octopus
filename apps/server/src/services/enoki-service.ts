import type { ServerConfig } from "../config/env.js";
import { createSponsoredTransaction, enokiSponsorshipEnabled, executeSponsoredTransaction } from "../enoki.js";

/** Optional Enoki sponsored-transaction support. */
export const createEnokiService = (config: ServerConfig) => ({
  isEnabled: (): boolean => enokiSponsorshipEnabled(config),
  createSponsored: (input: Parameters<typeof createSponsoredTransaction>[1]) =>
    createSponsoredTransaction(config, input),
  executeSponsored: (digest: string, input: Parameters<typeof executeSponsoredTransaction>[2]) =>
    executeSponsoredTransaction(config, digest, input)
});

export type EnokiService = ReturnType<typeof createEnokiService>;
