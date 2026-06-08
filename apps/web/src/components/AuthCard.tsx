import type { ReactNode } from "react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import type { LoginState } from "../hooks/useAuthFlow.js";
import { EnokiConnectButtons } from "./EnokiConnectButtons.js";

export type AuthCardProps = {
  title: string;
  ariaLabel: string;
  details: ReactNode;
  actionLabel: string;
  busyLabel: string;
  busy: boolean;
  disabled: boolean;
  onAction: () => void;
  state: LoginState;
  message: string;
};

/** The shared authorization card shell used by every auth panel. */
export function AuthCard({
  title,
  ariaLabel,
  details,
  actionLabel,
  busyLabel,
  busy,
  disabled,
  onAction,
  state,
  message
}: AuthCardProps) {
  return (
    <main className="auth-shell">
      <section className="auth-card" aria-label={ariaLabel}>
        <h1>{title}</h1>
        <div className="detail-list">{details}</div>
        <div className="actions">
          <EnokiConnectButtons />
          <ConnectButton>Connect Wallet</ConnectButton>
          <button className="authorize-button" disabled={disabled} onClick={onAction} type="button">
            {busy ? busyLabel : actionLabel}
          </button>
        </div>
        {message && <p className={`status ${state}`}>{message}</p>}
      </section>
    </main>
  );
}
