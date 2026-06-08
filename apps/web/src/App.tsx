import type { ComponentType } from "react";
import { DAppKitProvider } from "@mysten/dapp-kit-react";
import { dAppKit } from "./dapp-kit.js";
import { useLoginParams } from "./hooks/useLoginParams.js";
import { authPanelMode, type AuthPanelMode, type LoginParams } from "./login-params.js";
import { CliLoginPanel } from "./panels/CliLoginPanel.js";
import { RepoAccessPanel } from "./panels/RepoAccessPanel.js";
import { UnlockRepoPanel } from "./panels/UnlockRepoPanel.js";
import { WebLoginPanel } from "./panels/WebLoginPanel.js";
import "./styles.css";

const PANELS: Record<AuthPanelMode, ComponentType<{ params: LoginParams }>> = {
  cli: CliLoginPanel,
  web: WebLoginPanel,
  unlock: UnlockRepoPanel,
  access: RepoAccessPanel
};

export function App() {
  const params = useLoginParams();
  const Panel = PANELS[authPanelMode(params.mode)];

  return (
    <DAppKitProvider dAppKit={dAppKit}>
      <div className={params.embedded ? "embedded-auth" : undefined}>
        <Panel params={params} />
      </div>
    </DAppKitProvider>
  );
}
