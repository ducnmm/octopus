import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

const optionalNumber = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

export const runtimeConfig = {
  server:
    import.meta.env.VITE_OCTOPUS_SERVER_URL ??
    (import.meta.env.DEV ? "http://127.0.0.1:48787" : "https://octopus-server.up.railway.app"),
  suiNetwork: (import.meta.env.VITE_SUI_NETWORK ?? "testnet") as "testnet" | "mainnet" | "devnet" | "localnet",
  suiRpcUrl: import.meta.env.VITE_SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443",
  packageId: import.meta.env.VITE_SUI_PACKAGE_ID ?? "",
  accountRegistryId: import.meta.env.VITE_OCTOPUS_ACCOUNT_REGISTRY_ID ?? "",
  repoRegistryId: import.meta.env.VITE_OCTOPUS_REPO_REGISTRY_ID ?? "",
  enoki: {
    publicApiKey: import.meta.env.VITE_ENOKI_PUBLIC_API_KEY ?? import.meta.env.VITE_ENOKI_API_KEY ?? "",
    apiUrl: import.meta.env.VITE_ENOKI_API_URL || undefined,
    additionalEpochs: optionalNumber(import.meta.env.VITE_ENOKI_ADDITIONAL_EPOCHS),
    sponsorTransactions: import.meta.env.VITE_ENOKI_SPONSOR_TRANSACTIONS !== "0",
    providers: {
      google: import.meta.env.VITE_ENOKI_GOOGLE_CLIENT_ID ?? "",
      facebook: import.meta.env.VITE_ENOKI_FACEBOOK_CLIENT_ID ?? "",
      twitch: import.meta.env.VITE_ENOKI_TWITCH_CLIENT_ID ?? "",
      onefc: import.meta.env.VITE_ENOKI_ONEFC_CLIENT_ID ?? "",
      playtron: import.meta.env.VITE_ENOKI_PLAYTRON_CLIENT_ID ?? ""
    }
  }
};

export const suiClient = new SuiJsonRpcClient({
  url: runtimeConfig.suiRpcUrl,
  network: runtimeConfig.suiNetwork
});
