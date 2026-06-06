import {
  enokiWalletsInitializer,
  isEnokiNetwork,
  type AuthProvider
} from "@mysten/enoki";
import { runtimeConfig } from "./config.js";

export const enokiProviderOrder: AuthProvider[] = ["google", "facebook", "twitch", "onefc", "playtron"];

export const enokiProviderLabels: Record<AuthProvider, string> = {
  google: "Google",
  facebook: "Facebook",
  twitch: "Twitch",
  onefc: "ONE",
  playtron: "Playtron"
};

const configuredProviders = () => {
  return Object.fromEntries(
    enokiProviderOrder
      .map((provider) => {
        const clientId = runtimeConfig.enoki.providers[provider]?.trim();
        return clientId ? [provider, { clientId }] : null;
      })
      .filter((entry): entry is [AuthProvider, { clientId: string }] => Boolean(entry))
  ) as Partial<Record<AuthProvider, { clientId: string }>>;
};

export const createEnokiWalletInitializers = () => {
  if (!runtimeConfig.enoki.publicApiKey || !isEnokiNetwork(runtimeConfig.suiNetwork)) {
    return [];
  }

  const providers = configuredProviders();
  if (Object.keys(providers).length === 0) {
    return [];
  }

  return [
    enokiWalletsInitializer({
      apiKey: runtimeConfig.enoki.publicApiKey,
      ...(runtimeConfig.enoki.apiUrl ? { apiUrl: runtimeConfig.enoki.apiUrl } : {}),
      ...(runtimeConfig.enoki.additionalEpochs === undefined
        ? {}
        : { additionalEpochs: runtimeConfig.enoki.additionalEpochs }),
      providers
    })
  ];
};
