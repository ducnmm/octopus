import { z } from "zod";

export const repoNameSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._-]+$/);

export const ownerNameSchema = z
  .string()
  .min(1)
  .max(235)
  .regex(/^[A-Za-z0-9._-]+$/);

export const repoVisibilitySchema = z.enum(["public", "private"]);

export const createRepoRequestSchema = z.object({
  owner: ownerNameSchema.optional(),
  name: repoNameSchema,
  visibility: repoVisibilitySchema.default("public")
});

export type CreateRepoRequest = z.infer<typeof createRepoRequestSchema>;

export const gitDelegateKeyHeader = "x-octopus-delegate-key";
export const gitAccountIdHeader = "x-octopus-account-id";
export const delegateAuthTokenHeader = "x-octopus-auth-token";

export const delegateAuthHeaders = {
  token: delegateAuthTokenHeader,
  delegateKey: gitDelegateKeyHeader,
  accountId: gitAccountIdHeader
} as const;

export const hexStringSchema = z.string().regex(/^(0x)?[0-9a-fA-F]+$/);

export const octopusCredentialsSchema = z.object({
  delegatePrivateKey: z.string().min(1),
  delegatePublicKey: hexStringSchema,
  delegateAddress: z.string().min(1),
  walletAddress: z.string().min(1),
  accountId: z.string().min(1),
  serverUrl: z.string().url(),
  webUrl: z.string().url(),
  packageId: z.string().optional(),
  accountRegistryId: z.string().optional(),
  repoRegistryId: z.string().optional(),
  loggedInAt: z.string().optional()
});

export type OctopusCredentials = z.infer<typeof octopusCredentialsSchema>;

export const delegateAuthScopeSchema = z.enum(["rest", "git"]);

export const delegateAuthTokenSchema = z.object({
  v: z.literal(1),
  accountId: z.string().min(1),
  delegatePublicKey: hexStringSchema,
  delegateAddress: z.string().min(1),
  scope: delegateAuthScopeSchema,
  issuedAtMs: z.number().int().nonnegative(),
  expiresAtMs: z.number().int().positive(),
  signature: z.string().min(1)
});

export type DelegateAuthToken = z.infer<typeof delegateAuthTokenSchema>;
export type DelegateAuthTokenPayload = Omit<DelegateAuthToken, "signature">;

export const delegateAuthTokenMessage = (payload: DelegateAuthTokenPayload): string => {
  return [
    "Octopus delegate auth v1",
    `accountId:${payload.accountId}`,
    `delegatePublicKey:${payload.delegatePublicKey.replace(/^0x/, "").toLowerCase()}`,
    `delegateAddress:${payload.delegateAddress}`,
    `scope:${payload.scope}`,
    `issuedAtMs:${payload.issuedAtMs}`,
    `expiresAtMs:${payload.expiresAtMs}`
  ].join("\n");
};

export const authCallbackRequestSchema = z.object({
  walletAddress: z.string().min(1),
  accountId: z.string().min(1),
  serverUrl: z.string().url().optional(),
  webUrl: z.string().url().optional(),
  packageId: z.string().optional(),
  accountRegistryId: z.string().optional(),
  repoRegistryId: z.string().optional()
});

export type AuthCallbackRequest = z.infer<typeof authCallbackRequestSchema>;

export const registerDelegateRequestSchema = z.object({
  walletAddress: z.string().min(1),
  accountId: z.string().min(1).optional(),
  delegatePublicKey: hexStringSchema,
  delegateAddress: z.string().min(1),
  label: z.string().default("octopus-cli"),
  packageId: z.string().optional(),
  accountRegistryId: z.string().optional(),
  repoRegistryId: z.string().optional()
});

export type RegisterDelegateRequest = z.infer<typeof registerDelegateRequestSchema>;

export type RepoSummary = {
  owner: string;
  name: string;
  visibility: z.infer<typeof repoVisibilitySchema>;
  gitRemotePath: string;
};

export const envInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return parsed;
};
