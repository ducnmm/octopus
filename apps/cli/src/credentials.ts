import { homedir } from "node:os";
import { join } from "node:path";

export const credentialsPath = (home = homedir()): string => {
  return join(home, ".octopus", "credentials.json");
};
