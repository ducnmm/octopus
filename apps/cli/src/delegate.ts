import { randomBytes } from "node:crypto";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { fromHex } from "@mysten/sui/utils";
import {
  delegateAuthTokenMessage,
  type DelegateAuthToken,
  type OctopusCredentials
} from "@octopus/shared";

export type DelegateIdentity = {
  delegatePrivateKey: string;
  delegatePublicKey: string;
  delegateAddress: string;
};

const stripHexPrefix = (value: string): string => {
  return value.startsWith("0x") ? value.slice(2) : value;
};

export const keypairFromPrivateKey = (privateKey: string): Ed25519Keypair => {
  const trimmed = privateKey.trim();
  const hex = stripHexPrefix(trimmed);
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    return Ed25519Keypair.fromSecretKey(fromHex(hex));
  }

  return Ed25519Keypair.fromSecretKey(trimmed);
};

export const identityFromPrivateKey = (privateKey: string): DelegateIdentity => {
  const keypair = keypairFromPrivateKey(privateKey);
  return {
    delegatePrivateKey: privateKey,
    delegatePublicKey: Buffer.from(keypair.getPublicKey().toRawBytes()).toString("hex"),
    delegateAddress: keypair.getPublicKey().toSuiAddress()
  };
};

export const generateDelegateIdentity = (): DelegateIdentity => {
  const keypair = Ed25519Keypair.fromSecretKey(randomBytes(32));
  return identityFromPrivateKey(keypair.getSecretKey());
};

export const createDelegateAuthToken = async (input: {
  credentials: OctopusCredentials;
  scope: "rest" | "git";
  expiresInMs: number;
  nowMs?: number;
}): Promise<string> => {
  const nowMs = input.nowMs ?? Date.now();
  const payload = {
    v: 1 as const,
    accountId: input.credentials.accountId,
    delegatePublicKey: input.credentials.delegatePublicKey.replace(/^0x/, "").toLowerCase(),
    delegateAddress: input.credentials.delegateAddress,
    scope: input.scope,
    issuedAtMs: nowMs,
    expiresAtMs: nowMs + input.expiresInMs
  };
  const keypair = keypairFromPrivateKey(input.credentials.delegatePrivateKey);
  const message = Buffer.from(delegateAuthTokenMessage(payload), "utf8");
  const { signature } = await keypair.signPersonalMessage(message);
  const token: DelegateAuthToken = {
    ...payload,
    signature
  };

  return Buffer.from(JSON.stringify(token), "utf8").toString("base64url");
};
