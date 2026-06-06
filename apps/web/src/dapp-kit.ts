import { createDAppKit } from "@mysten/dapp-kit-react";
import { runtimeConfig, suiClient } from "./config.js";
import { createEnokiWalletInitializers } from "./enoki.js";

export const dAppKit = createDAppKit({
  networks: [runtimeConfig.suiNetwork],
  defaultNetwork: runtimeConfig.suiNetwork,
  createClient: () => suiClient,
  walletInitializers: createEnokiWalletInitializers()
});
