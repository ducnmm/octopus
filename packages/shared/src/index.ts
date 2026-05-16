import { z } from "zod";

export const repoNameSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._-]+$/);

export const ownerNameSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._-]+$/);

export const repoVisibilitySchema = z.enum(["public", "private"]);

export const createRepoRequestSchema = z.object({
  owner: ownerNameSchema,
  name: repoNameSchema,
  visibility: repoVisibilitySchema.default("public")
});

export type CreateRepoRequest = z.infer<typeof createRepoRequestSchema>;

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
