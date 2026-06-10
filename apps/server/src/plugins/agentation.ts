import fp from "fastify-plugin";
import type { ServerConfig } from "../config/env.js";

// Agentation v3 ships only as a React component, while the server pages are
// plain HTML strings — so the bootstrap pulls React + Agentation from esm.sh
// at runtime instead of adding a frontend build step to the server.
const agentationBootstrap = (endpoint: string): string => `<script type="module">
import React from "https://esm.sh/react@19";
import { createRoot } from "https://esm.sh/react-dom@19/client";
import { Agentation } from "https://esm.sh/agentation@3?deps=react@19,react-dom@19";
const mount = document.createElement("div");
mount.id = "octopus-agentation";
document.body.appendChild(mount);
createRoot(mount).render(React.createElement(Agentation, { endpoint: ${JSON.stringify(endpoint)} }));
</script>`;

export type AgentationPluginOptions = {
  config: ServerConfig;
};

/**
 * Dev-only feedback overlay: when OCTOPUS_AGENTATION_ENDPOINT is set, injects
 * the Agentation toolbar into every server-rendered HTML page so annotations
 * work on the Fastify UI, not just the Vite web app.
 */
export const agentationPlugin = fp<AgentationPluginOptions>(
  async (app, opts) => {
    const endpoint = opts.config.agentationEndpoint;
    if (!endpoint) {
      return;
    }

    const bootstrap = agentationBootstrap(endpoint);
    app.log.info({ endpoint }, "agentation overlay enabled for server-rendered pages");

    app.addHook("onSend", async (_request, reply, payload) => {
      const contentType = reply.getHeader("content-type");
      if (typeof contentType !== "string" || !contentType.includes("text/html")) {
        return payload;
      }
      if (typeof payload !== "string" || !payload.includes("</body>")) {
        return payload;
      }

      reply.removeHeader("content-length");
      const closingTag = payload.lastIndexOf("</body>");
      return payload.slice(0, closingTag) + bootstrap + payload.slice(closingTag);
    });
  },
  { name: "octopus-agentation" }
);

export default agentationPlugin;
