export const appName = "Octopus Docs";

export const siteUrl = process.env.NEXT_PUBLIC_DOCS_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:3004";

export const octopusAppUrl = process.env.NEXT_PUBLIC_OCTOPUS_APP_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:48787";

export const docsRoute = "/";
