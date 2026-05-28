import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { encryptArtifactForRepo } from "../src/seal.js";

let workspace: string | undefined;

afterEach(async () => {
  if (workspace) {
    await rm(workspace, { recursive: true, force: true });
    workspace = undefined;
  }
});

test("does not fall back to local-seal when durable private storage requires SEAL", async () => {
  workspace = await mkdtemp(join(tmpdir(), "octopus-seal-"));
  const sourcePath = join(workspace, "snapshot.bundle");
  const outputPath = join(workspace, "snapshot.bundle.sealed");
  await writeFile(sourcePath, "private bundle bytes");

  await expect(encryptArtifactForRepo({
    sourcePath,
    outputPath,
    repoId: "ducnmm/private-demo",
    sealMode: "local",
    allowLocalSealFallback: false
  })).rejects.toThrow("Private artifact encryption requires SEAL for durable storage");
});
