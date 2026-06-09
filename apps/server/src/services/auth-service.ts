import { randomBytes } from "node:crypto";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { httpError } from "../lib/http-error.js";
import type { WebAuthStore } from "../lib/web-auth-store.js";
import {
  repoUnlockChallengeTtlMs,
  webAccountId,
  webChallengeTtlMs,
  webSessionTtlMs,
  type WebSession
} from "../lib/web-session.js";

/** Web-session and repo-unlock challenge lifecycle (issue + signature verify). */
export const createAuthService = (webAuthStore: WebAuthStore) => {
  const issueWebSessionChallenge = (serverOrigin: string, returnTo: string) => {
    const now = Date.now();
    const expiresAtMs = now + webChallengeTtlMs;
    const nonce = randomBytes(24).toString("base64url");
    const message = [
      "Octopus web session",
      "Version: 1",
      `Server: ${serverOrigin}`,
      `Nonce: ${nonce}`,
      `Issued at: ${new Date(now).toISOString()}`,
      `Expires at: ${new Date(expiresAtMs).toISOString()}`,
      `Return to: ${returnTo}`
    ].join("\n");

    webAuthStore.webChallenges.set(nonce, { message, returnTo, expiresAtMs });
    return { nonce, message, expiresAtMs };
  };

  const verifyWebSessionChallenge = async (params: {
    nonce: string;
    walletAddress: string;
    signature: string;
    accountId?: string;
  }): Promise<{ sessionId: string; session: WebSession; returnTo: string }> => {
    const walletAddress = params.walletAddress.trim().toLowerCase();
    const accountId = params.accountId?.trim() || webAccountId(walletAddress);
    if (!params.nonce || !walletAddress || !params.signature) {
      throw httpError("Missing web session signature payload", 400);
    }

    webAuthStore.cleanup();
    const challenge = webAuthStore.webChallenges.get(params.nonce);
    webAuthStore.webChallenges.delete(params.nonce);
    if (!challenge || challenge.expiresAtMs <= Date.now()) {
      throw httpError("Web session challenge expired", 401);
    }

    try {
      await verifyPersonalMessageSignature(Buffer.from(challenge.message, "utf8"), params.signature, {
        address: walletAddress
      });
    } catch {
      throw httpError("Invalid web session signature", 401);
    }

    const now = Date.now();
    const session: WebSession = {
      accountId,
      walletAddress,
      unlockedRepoIds: new Set(),
      createdAtMs: now,
      expiresAtMs: now + webSessionTtlMs
    };
    return { sessionId: randomBytes(32).toString("base64url"), session, returnTo: challenge.returnTo };
  };

  const issueUnlockChallenge = (params: {
    serverOrigin: string;
    returnTo: string;
    repoId: string;
    sessionId: string;
  }) => {
    const now = Date.now();
    const expiresAtMs = now + repoUnlockChallengeTtlMs;
    const nonce = randomBytes(24).toString("base64url");
    const message = [
      "Octopus private repository unlock",
      "Version: 1",
      `Server: ${params.serverOrigin}`,
      `Repository: ${params.repoId}`,
      `Nonce: ${nonce}`,
      `Issued at: ${new Date(now).toISOString()}`,
      `Expires at: ${new Date(expiresAtMs).toISOString()}`,
      `Return to: ${params.returnTo}`
    ].join("\n");

    webAuthStore.repoUnlockChallenges.set(nonce, {
      message,
      returnTo: params.returnTo,
      expiresAtMs,
      repoId: params.repoId,
      sessionId: params.sessionId
    });
    return { nonce, message, expiresAtMs };
  };

  const verifyUnlock = async (params: {
    nonce: string;
    signature: string;
    sessionId: string;
    walletAddress: string;
    repoId: string;
  }): Promise<{ returnTo: string }> => {
    webAuthStore.cleanup();
    const challenge = webAuthStore.repoUnlockChallenges.get(params.nonce);
    webAuthStore.repoUnlockChallenges.delete(params.nonce);
    if (
      !challenge ||
      challenge.expiresAtMs <= Date.now() ||
      challenge.sessionId !== params.sessionId ||
      challenge.repoId !== params.repoId
    ) {
      throw httpError("Repository unlock challenge expired", 401);
    }

    try {
      await verifyPersonalMessageSignature(Buffer.from(challenge.message, "utf8"), params.signature, {
        address: params.walletAddress
      });
    } catch {
      throw httpError("Invalid repository unlock signature", 401);
    }

    return { returnTo: challenge.returnTo };
  };

  return { issueWebSessionChallenge, verifyWebSessionChallenge, issueUnlockChallenge, verifyUnlock };
};

export type AuthService = ReturnType<typeof createAuthService>;
