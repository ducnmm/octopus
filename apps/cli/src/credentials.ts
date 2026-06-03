import { homedir } from "node:os";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { octopusCredentialsSchema, type OctopusCredentials } from "@ducnmm/octopus-shared";

export const credentialsPath = (home = homedir()): string => {
  return join(home, ".octopus", "credentials.json");
};

export const readCredentials = async (home?: string): Promise<OctopusCredentials | null> => {
  try {
    const raw = await readFile(credentialsPath(home), "utf8");
    return octopusCredentialsSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const writeCredentials = async (
  credentials: OctopusCredentials,
  home?: string
): Promise<string> => {
  const path = credentialsPath(home);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(octopusCredentialsSchema.parse(credentials), null, 2)}\n`, {
    mode: 0o600
  });
  return path;
};

export const deleteCredentials = async (home?: string): Promise<boolean> => {
  try {
    await rm(credentialsPath(home));
    return true;
  } catch {
    return false;
  }
};
