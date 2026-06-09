import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";

const underwaterBackgroundAsset = new URL("../../assets/octopus-underwater-bg.png", import.meta.url);
const underwaterBackgroundDarkAsset = new URL("../../assets/octopus-underwater-bg-dark.png", import.meta.url);
const auroraHomeAsset = new URL("../../assets/aurora-home.avif", import.meta.url);
const walrusMascotAsset = new URL("../../assets/octopus-walrus-mascot.png", import.meta.url);
const ratchFontAsset = new URL("../../assets/ratch.woff2", import.meta.url);

const staticAssetRoutes = [
  { path: "/assets/aurora-home.avif", source: auroraHomeAsset, type: "image/avif" },
  { path: "/assets/octopus-walrus-mascot.png", source: walrusMascotAsset, type: "image/png" },
  { path: "/assets/ratch.woff2", source: ratchFontAsset, type: "font/woff2" },
  { path: "/favicon.ico", source: new URL("../../assets/favicon/favicon.ico", import.meta.url), type: "image/x-icon" },
  {
    path: "/favicon-16x16.png",
    source: new URL("../../assets/favicon/favicon-16x16.png", import.meta.url),
    type: "image/png"
  },
  {
    path: "/favicon-32x32.png",
    source: new URL("../../assets/favicon/favicon-32x32.png", import.meta.url),
    type: "image/png"
  },
  {
    path: "/apple-touch-icon.png",
    source: new URL("../../assets/favicon/apple-touch-icon.png", import.meta.url),
    type: "image/png"
  },
  {
    path: "/android-chrome-192x192.png",
    source: new URL("../../assets/favicon/android-chrome-192x192.png", import.meta.url),
    type: "image/png"
  },
  {
    path: "/android-chrome-512x512.png",
    source: new URL("../../assets/favicon/android-chrome-512x512.png", import.meta.url),
    type: "image/png"
  },
  {
    path: "/site.webmanifest",
    source: new URL("../../assets/favicon/site.webmanifest", import.meta.url),
    type: "application/manifest+json"
  }
] as const;

export const assetRoutes = async (app: FastifyInstance) => {
  app.get("/assets/octopus-underwater-bg.png", async (_request, reply) => {
    const image = await readFile(underwaterBackgroundAsset);
    await reply.header("cache-control", "public, max-age=31536000, immutable").type("image/png").send(image);
  });

  app.get("/assets/octopus-underwater-bg-dark.png", async (_request, reply) => {
    const image = await readFile(underwaterBackgroundDarkAsset);
    await reply.header("cache-control", "public, max-age=31536000, immutable").type("image/png").send(image);
  });

  for (const asset of staticAssetRoutes) {
    app.get(asset.path, async (_request, reply) => {
      const data = await readFile(asset.source);
      await reply.header("cache-control", "public, max-age=31536000, immutable").type(asset.type).send(data);
    });
  }
};
