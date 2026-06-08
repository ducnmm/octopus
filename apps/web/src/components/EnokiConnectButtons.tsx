import { useMemo, useState } from "react";
import { useCurrentAccount, useWallets, type UiWallet } from "@mysten/dapp-kit-react";
import { getWalletMetadata, isEnokiWallet, type AuthProvider } from "@mysten/enoki";
import { enokiProviderLabels, enokiProviderOrder } from "../enoki.js";
import { useDelegateKit } from "../hooks/useDelegateKit.js";

export function EnokiConnectButtons() {
  const account = useCurrentAccount();
  const kit = useDelegateKit();
  const wallets = useWallets();
  const [connectingProvider, setConnectingProvider] = useState<AuthProvider | null>(null);
  const enokiWallets = useMemo(() => {
    return wallets
      .filter(isEnokiWallet)
      .map((wallet) => ({ wallet, provider: getWalletMetadata(wallet)?.provider }))
      .filter((entry): entry is { wallet: UiWallet; provider: AuthProvider } => Boolean(entry.provider))
      .sort((left, right) => enokiProviderOrder.indexOf(left.provider) - enokiProviderOrder.indexOf(right.provider));
  }, [wallets]);

  if (account || enokiWallets.length === 0) {
    return null;
  }

  return (
    <div className="enoki-actions">
      {enokiWallets.map(({ wallet, provider }) => (
        <button
          className="enoki-button"
          disabled={connectingProvider !== null}
          key={provider}
          onClick={() => {
            setConnectingProvider(provider);
            void kit
              .connectWallet({ wallet })
              .catch((error) => {
                console.error(error);
              })
              .finally(() => setConnectingProvider(null));
          }}
          type="button"
        >
          {connectingProvider === provider ? "Connecting" : `Continue with ${enokiProviderLabels[provider]}`}
        </button>
      ))}
    </div>
  );
}
