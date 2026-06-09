// Backwards-compatible shim. The validated implementation lives in `config/env.ts`.
// Existing modules import `./config.js`; new code should import `./config/env.js`.
export { loadConfig } from "./config/env.js";
export type { ServerConfig } from "./config/env.js";
