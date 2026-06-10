import type { ComponentType } from "react";
import { useLoginParams } from "../hooks/useLoginParams.js";
import { authPanelMode, type AuthPanelMode, type LoginParams } from "../login-params.js";
import { CliLoginPanel } from "../panels/CliLoginPanel.js";
import { RepoAccessPanel } from "../panels/RepoAccessPanel.js";
import { UnlockRepoPanel } from "../panels/UnlockRepoPanel.js";
import { WebLoginPanel } from "../panels/WebLoginPanel.js";

const PANELS: Record<AuthPanelMode, ComponentType<{ params: LoginParams }>> = {
  cli: CliLoginPanel,
  web: WebLoginPanel,
  unlock: UnlockRepoPanel,
  access: RepoAccessPanel
};

/** Wallet login/unlock/access flows; reached at /login with mode query params. */
export const AuthPage = () => {
  const params = useLoginParams();
  const Panel = PANELS[authPanelMode(params.mode)];

  return (
    <div className={params.embedded ? "embedded-auth" : undefined}>
      <Panel params={params} />
    </div>
  );
};
