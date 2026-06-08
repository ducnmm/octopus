import { useCallback, useEffect, useRef, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import type { LoginParams } from "../login-params.js";
import { notifyBrowserHost } from "../lib/browser-flow.js";
import { errorMessage } from "../lib/errors.js";

export type LoginState = "idle" | "working" | "success" | "error";

export type AuthAccount = NonNullable<ReturnType<typeof useCurrentAccount>>;

/** Helpers handed to an auth action so it can report progress and outcome. */
export type AuthActionContext = {
  account: AuthAccount;
  setState: (state: LoginState) => void;
  setMessage: (message: string) => void;
};

export type AuthAction = (context: AuthActionContext) => Promise<void>;

export type AuthFlow = {
  account: ReturnType<typeof useCurrentAccount>;
  state: LoginState;
  message: string;
  busy: boolean;
  start: () => void;
};

const NEEDS_WALLET_DELAY_MS = 900;

/**
 * Shared lifecycle for the auth panels: tracks status/message, runs the panel's
 * action with uniform error handling, and (when `autoStart` is enabled) kicks
 * the action off once a wallet connects while signalling embedded hosts that a
 * wallet is still required.
 */
export const useAuthFlow = (
  params: LoginParams,
  action: AuthAction,
  options: { autoStart?: boolean } = {}
): AuthFlow => {
  const autoStart = options.autoStart ?? false;
  const account = useCurrentAccount();
  const [state, setState] = useState<LoginState>("idle");
  const [message, setMessage] = useState("");
  const startedRef = useRef(false);

  const run = useCallback(
    async (active: AuthAccount) => {
      try {
        await action({ account: active, setState, setMessage });
      } catch (error) {
        const text = errorMessage(error);
        setState("error");
        setMessage(text);
        if (params.embedded) {
          notifyBrowserHost(params, "octopus-auth-error", { message: text });
        }
      }
    },
    [action, params]
  );

  const start = useCallback(() => {
    if (!account?.address) {
      setMessage("Connect a Sui wallet first.");
      return;
    }
    void run(account);
  }, [account, run]);

  useEffect(() => {
    if (!autoStart || startedRef.current || !account?.address || state !== "idle") {
      return;
    }
    startedRef.current = true;
    void run(account);
  }, [account, autoStart, run, state]);

  useEffect(() => {
    if (!params.embedded || !autoStart || account?.address || state !== "idle" || startedRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (!account?.address && !startedRef.current) {
        notifyBrowserHost(params, "octopus-auth-needs-wallet");
      }
    }, NEEDS_WALLET_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [account, autoStart, params, state]);

  return { account, state, message, busy: state === "working", start };
};
