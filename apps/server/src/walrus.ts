import { spawn } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { envInt } from "@octopus/shared";

export type ArtifactStoreResult = {
  blobId: string;
  blobObjectId?: string;
  storedArtifactPath: string;
  alreadyExisted: boolean;
  storageDurationEpochs: number;
  storageMode: "local" | "walrus-cli";
};

export type ArtifactReadResult = {
  blobId: string;
  artifactPath: string;
  storageMode: "local" | "walrus-cli" | "walrus-aggregator";
};

type WalrusStoreResult = {
  blobId: string;
  blobObjectId?: string;
  storageDurationEpochs: number;
  alreadyExisted: boolean;
};

const runWalrus = async (args: string[]): Promise<{ stdout: string; stderr: string }> => {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(process.env.WALRUS_BIN ?? "walrus", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      reject(
        new Error(
          `Failed to run walrus binary: ${error.message}. Set OCTOPUS_WALRUS_MODE=local to use local fallback.`
        )
      );
    });
    child.on("close", (code) => {
      const result = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      };

      if (code === 0) {
        resolvePromise(result);
        return;
      }

      reject(new Error(`walrus ${args.join(" ")} failed: ${result.stderr || result.stdout}`));
    });
  });
};

const parseWalrusStoreOutput = (stdout: string, stderr: string): WalrusStoreResult => {
  const combined = `${stdout}\n${stderr}`;

  try {
    let parsed = JSON.parse(stdout) as Record<string, unknown> | Array<Record<string, unknown>>;
    if (Array.isArray(parsed)) {
      const first = parsed[0];
      parsed = (first?.blobStoreResult as Record<string, unknown> | undefined) ?? first ?? {};
    }

    if (parsed.newlyCreated) {
      const newlyCreated = parsed.newlyCreated as Record<string, unknown>;
      const blobObject = newlyCreated.blobObject as Record<string, unknown>;
      const id = blobObject.id as Record<string, unknown> | undefined;

      return {
        blobId: String(blobObject.blobId ?? blobObject.blob_id ?? ""),
        blobObjectId: id?.id ? String(id.id) : undefined,
        storageDurationEpochs: Number(blobObject.storedEpoch ?? blobObject.stored_epoch ?? 0),
        alreadyExisted: false
      };
    }

    if (parsed.alreadyCertified) {
      const alreadyCertified = parsed.alreadyCertified as Record<string, unknown>;
      return {
        blobId: String(alreadyCertified.blobId ?? alreadyCertified.blob_id ?? ""),
        storageDurationEpochs: 0,
        alreadyExisted: true
      };
    }
  } catch {
    // Fall back to plaintext parsing for older walrus CLI versions.
  }

  const blobId = combined.match(/Blob ID:\s+(\S+)/)?.[1];
  if (!blobId) {
    throw new Error(`Failed to parse walrus store output:\n${combined}`);
  }

  return {
    blobId,
    blobObjectId: combined.match(/Object ID:\s+(0x\S+)/)?.[1],
    storageDurationEpochs: Number.parseInt(combined.match(/End Epoch:\s+(\d+)/)?.[1] ?? "0", 10),
    alreadyExisted: /already certified/i.test(combined)
  };
};

const storeWithWalrusCli = async (artifactPath: string): Promise<WalrusStoreResult> => {
  const epochs = envInt(process.env.OCTOPUS_WALRUS_EPOCHS, 5);
  const result = await runWalrus(["store", artifactPath, "--json", "--epochs", String(epochs)]);
  return parseWalrusStoreOutput(result.stdout, result.stderr);
};

const readWithAggregator = async (blobId: string, outputPath: string): Promise<void> => {
  const baseUrl = (process.env.WALRUS_AGGREGATOR_URL ?? "").replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("WALRUS_AGGREGATOR_URL is not configured");
  }

  const response = await fetch(`${baseUrl}/v1/blobs/${encodeURIComponent(blobId)}`);
  if (!response.ok) {
    throw new Error(`Walrus aggregator read failed for ${blobId}: HTTP ${response.status}`);
  }

  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
};

export const storeArtifact = async (input: {
  dataDir: string;
  sourcePath: string;
  artifactDigest: string;
}): Promise<ArtifactStoreResult> => {
  const blobDir = join(input.dataDir, "walrus", "blobs");
  await mkdir(blobDir, { recursive: true });

  const storedArtifactPath = join(blobDir, `${input.artifactDigest}.bundle`);
  await copyFile(input.sourcePath, storedArtifactPath);

  if (process.env.OCTOPUS_WALRUS_MODE === "cli") {
    const result = await storeWithWalrusCli(storedArtifactPath);
    return {
      blobId: result.blobId,
      blobObjectId: result.blobObjectId,
      storedArtifactPath,
      alreadyExisted: result.alreadyExisted,
      storageDurationEpochs: result.storageDurationEpochs,
      storageMode: "walrus-cli"
    };
  }

  return {
    blobId: `local:${input.artifactDigest}`,
    storedArtifactPath,
    alreadyExisted: false,
    storageDurationEpochs: 0,
    storageMode: "local"
  };
};

export const readArtifact = async (input: {
  dataDir: string;
  blobId: string;
  artifactDigest: string;
  preferredPath?: string;
}): Promise<ArtifactReadResult> => {
  const localPath = input.preferredPath ?? join(input.dataDir, "walrus", "blobs", `${input.artifactDigest}.bundle`);

  if (input.blobId.startsWith("local:")) {
    return {
      blobId: input.blobId,
      artifactPath: localPath,
      storageMode: "local"
    };
  }

  await mkdir(dirname(localPath), { recursive: true });

  if (process.env.WALRUS_AGGREGATOR_URL) {
    await readWithAggregator(input.blobId, localPath);

    return {
      blobId: input.blobId,
      artifactPath: localPath,
      storageMode: "walrus-aggregator"
    };
  }

  await runWalrus(["read", input.blobId, "--out", localPath]);

  return {
    blobId: input.blobId,
    artifactPath: localPath,
    storageMode: "walrus-cli"
  };
};
