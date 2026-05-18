import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

export const runtimeConfig = {
  suiNetwork: (import.meta.env.VITE_SUI_NETWORK ?? "testnet") as "testnet",
  suiRpcUrl: import.meta.env.VITE_SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443",
  packageId: import.meta.env.VITE_SUI_PACKAGE_ID ?? "",
  accountRegistryId: import.meta.env.VITE_OCTOPUS_ACCOUNT_REGISTRY_ID ?? "",
  repoRegistryId: import.meta.env.VITE_OCTOPUS_REPO_REGISTRY_ID ?? ""
};

export const suiClient = new SuiJsonRpcClient({
  url: runtimeConfig.suiRpcUrl,
  network: runtimeConfig.suiNetwork
});
