import type { ServerConfig } from "../config/env.js";
import { listRepoActivity, recordRepoAccessActivity } from "../repo-activity.js";

/** Repository contribution / access activity log. */
export const createActivityRepository = (config: ServerConfig) => ({
  list: (state: Parameters<typeof listRepoActivity>[1]) => listRepoActivity(config, state),
  recordAccess: (entry: Parameters<typeof recordRepoAccessActivity>[1]) => recordRepoAccessActivity(config, entry)
});

export type ActivityRepository = ReturnType<typeof createActivityRepository>;
