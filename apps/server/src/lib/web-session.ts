import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyReply } from "fastify";
import type { AuthContext } from "../auth.js";

export const webSessionCookieName = "octopus_web_session";
export const webSessionTtlMs = 12 * 60 * 60 * 1000;
export const webChallengeTtlMs = 5 * 60 * 1000;
export const repoUnlockChallengeTtlMs = 5 * 60 * 1000;

export type WebChallenge = {
  message: string;
  returnTo: string;
  expiresAtMs: number;
};

export type WebSession = {
  accountId: string;
  walletAddress: string;
  unlockedRepoIds: Set<string>;
  createdAtMs: number;
  expiresAtMs: number;
};

export type WebSessionCookiePayload = {
  v: 1;
  sessionId: string;
  accountId: string;
  walletAddress: string;
  unlockedRepoIds: string[];
  createdAtMs: number;
  expiresAtMs: number;
};

export type RepoUnlockChallenge = WebChallenge & {
  repoId: string;
  sessionId: string;
};

export const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

export const webAccountId = (walletAddress: string): string => {
  const digest = createHash("sha256").update(walletAddress.toLowerCase()).digest("hex").slice(0, 40);
  return `web:${digest}`;
};

export const parseCookies = (raw: string | string[] | undefined): Record<string, string> => {
  const header = Array.isArray(raw) ? raw.join(";") : (raw ?? "");
  const cookies: Record<string, string> = {};

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!key) {
      continue;
    }
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }

  return cookies;
};

const signWebSessionCookiePayload = (payload: string, secret: string): string => {
  return createHmac("sha256", secret).update(payload).digest("base64url");
};

const constantTimeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const webSessionPayload = (sessionId: string, session: WebSession): WebSessionCookiePayload => ({
  v: 1,
  sessionId,
  accountId: session.accountId,
  walletAddress: session.walletAddress,
  unlockedRepoIds: [...session.unlockedRepoIds],
  createdAtMs: session.createdAtMs,
  expiresAtMs: session.expiresAtMs
});

export const encodeWebSessionCookie = (sessionId: string, session: WebSession, secret: string): string => {
  const payload = Buffer.from(JSON.stringify(webSessionPayload(sessionId, session)), "utf8").toString("base64url");
  return `${payload}.${signWebSessionCookiePayload(payload, secret)}`;
};

export const decodeWebSessionCookie = (
  value: string,
  secret: string
): { sessionId: string; session: WebSession } | null => {
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra !== undefined) {
    return null;
  }
  if (!constantTimeEqual(signature, signWebSessionCookiePayload(payload, secret))) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }

  const v = parsed.v;
  const sessionId = parsed.sessionId;
  const accountId = parsed.accountId;
  const walletAddress = parsed.walletAddress;
  const createdAtMs = parsed.createdAtMs;
  const expiresAtMs = parsed.expiresAtMs;
  const unlockedRepoIds = parsed.unlockedRepoIds;
  if (
    v !== 1 ||
    typeof sessionId !== "string" ||
    typeof accountId !== "string" ||
    typeof walletAddress !== "string" ||
    typeof createdAtMs !== "number" ||
    typeof expiresAtMs !== "number" ||
    !Array.isArray(unlockedRepoIds) ||
    unlockedRepoIds.some((repoId) => typeof repoId !== "string")
  ) {
    return null;
  }
  if (expiresAtMs <= Date.now()) {
    return null;
  }

  return {
    sessionId,
    session: {
      accountId,
      walletAddress,
      unlockedRepoIds: new Set(unlockedRepoIds),
      createdAtMs,
      expiresAtMs
    }
  };
};

export const authFromWebSession = (session: WebSession): AuthContext => ({
  accountId: session.accountId,
  walletAddress: session.walletAddress,
  delegatePublicKey: "web-session",
  delegateAddress: session.walletAddress,
  source: "web"
});

export const setWebSessionCookie = (
  reply: FastifyReply,
  sessionId: string,
  session: WebSession,
  secret: string,
  secure: boolean
): void => {
  const maxAge = Math.max(0, Math.floor((session.expiresAtMs - Date.now()) / 1000));
  const secureAttr = secure ? "; Secure" : "";
  const cookie = encodeWebSessionCookie(sessionId, session, secret);
  reply.header(
    "set-cookie",
    `${webSessionCookieName}=${encodeURIComponent(cookie)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureAttr}`
  );
};

export const clearWebSessionCookie = (reply: FastifyReply, secure: boolean): void => {
  const secureAttr = secure ? "; Secure" : "";
  reply.header(
    "set-cookie",
    `${webSessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureAttr}`
  );
};
