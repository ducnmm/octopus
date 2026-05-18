import { createDAppKit } from "@mysten/dapp-kit-react";
import { runtimeConfig, suiClient } from "./config.js";

export const dAppKit = createDAppKit({
  networks: [runtimeConfig.suiNetwork],
  defaultNetwork: runtimeConfig.suiNetwork,
  createClient: () => suiClient
});
