import type { LoginParams } from "../login-params.js";
import { HttpStatusError } from "./errors.js";

export type WebSessionChallenge = {
  nonce: string;
  message: string;
  expiresAtMs: number;
};

export type WebSessionResponse = {
  ok?: boolean;
  error?: string;
  returnTo?: string;
  accountId?: string;
  walletAddress?: string;
};

export const serverUrl = (params: Pick<LoginParams, "server">, path: string): string =>
  new URL(path, params.server || window.location.origin).toString();

export const jsonResponse = async <T,>(response: Response, fallback: string): Promise<T> => {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new HttpStatusError(body.error ?? `${fallback}: HTTP ${response.status}`, response.status);
  }

  return body as T;
};

export const callbackCli = async (
  params: LoginParams,
  body: { walletAddress: string; accountId: string }
): Promise<void> => {
  const response = await fetch(params.callback, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      walletAddress: body.walletAddress,
      accountId: body.accountId,
      state: params.state,
      serverUrl: params.server,
      webUrl: window.location.origin,
      packageId: params.packageId || undefined,
      accountRegistryId: params.accountRegistryId || undefined,
      repoRegistryId: params.repoRegistryId || undefined
    })
  });

  if (!response.ok) {
    throw new Error(`CLI callback failed: HTTP ${response.status}`);
  }
};
