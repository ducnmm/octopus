import { buildServer } from "./app.js";
import { loadConfig } from "./config/env.js";
import { assertGitVersionSupportsMergeTree } from "./git.js";

const config = loadConfig();
await assertGitVersionSupportsMergeTree();
const server = buildServer(config);

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  server.log.info({ signal }, "shutting down");
  try {
    await server.close();
    process.exit(0);
  } catch (error) {
    server.log.error({ err: error }, "error during shutdown");
    process.exit(1);
  }
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

await server.listen({
  host: config.host,
  port: config.port
});
