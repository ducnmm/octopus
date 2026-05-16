import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { readArtifact } from "../src/walrus.js";

let workspace: string | undefined;
let previousAggregatorUrl: string | undefined;

afterEach(async () => {
  if (workspace) {
    await rm(workspace, { recursive: true, force: true });
    workspace = undefined;
  }

  if (previousAggregatorUrl === undefined) {
    delete process.env.WALRUS_AGGREGATOR_URL;
  } else {
    process.env.WALRUS_AGGREGATOR_URL = previousAggregatorUrl;
  }
});

test("reads non-local blobs through the Walrus aggregator when configured", async () => {
  workspace = await mkdtemp(join(tmpdir(), "octopus-walrus-"));
  previousAggregatorUrl = process.env.WALRUS_AGGREGATOR_URL;
  const blobContent = Buffer.from("git bundle bytes");

  const server = createServer((request, response) => {
    expect(request.url).toBe("/v1/blobs/blob-123");
    response.writeHead(200, { "content-type": "application/octet-stream" });
    response.end(blobContent);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not resolve test server address");
  }

  process.env.WALRUS_AGGREGATOR_URL = `http://127.0.0.1:${address.port}`;

  try {
    const result = await readArtifact({
      dataDir: workspace,
      blobId: "blob-123",
      artifactDigest: "digest-123"
    });

    expect(result.storageMode).toBe("walrus-aggregator");
    await expect(readFile(result.artifactPath)).resolves.toEqual(blobContent);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
