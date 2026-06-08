import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  envDir: resolve(here, "../.."),
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(here, "src")
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/@mysten/")) {
            return "mysten";
          }
          if (id.includes("/node_modules/react") || id.includes("/node_modules/scheduler")) {
            return "react";
          }
        }
      }
    }
  }
});
