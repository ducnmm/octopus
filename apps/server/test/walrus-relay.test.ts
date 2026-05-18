import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { afterEach, expect, test, vi } from "vitest";

let workspace: string | undefined;
let previousMode: string | undefined;
let previousEpochs: string | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  vi.doUnmock("@mysten/sui/jsonRpc");
  vi.doUnmock("@mysten/walrus");
  vi.resetModules();

  if (workspace) {
    await rm(workspace, { recursive: true, force: true });
    workspace = undefined;
  }

  if (previousMode === undefined) {
    delete process.env.OCTOPUS_WALRUS_MODE;
  } else {
    process.env.OCTOPUS_WALRUS_MODE = previousMode;
  }

  if (previousEpochs === undefined) {
    delete process.env.OCTOPUS_WALRUS_EPOCHS;
  } else {
    process.env.OCTOPUS_WALRUS_EPOCHS = previousEpochs;
  }
});

test("stores artifacts through the Walrus upload relay with 50 default epochs", async () => {
  workspace = await mkdtemp(join(tmpdir(), "octopus-walrus-relay-"));
  previousMode = process.env.OCTOPUS_WALRUS_MODE;
  previousEpochs = process.env.OCTOPUS_WALRUS_EPOCHS;
  process.env.OCTOPUS_WALRUS_MODE = "relay";
  delete process.env.OCTOPUS_WALRUS_EPOCHS;

  const sourcePath = join(workspace, "snapshot.bundle");
  const bundleBytes = Buffer.from("git bundle bytes");
  await writeFile(sourcePath, bundleBytes);

  let registerArgs: { epochs?: number; owner?: string; deletable?: boolean } | undefined;
  let uploadedDigest: string | undefined;
  let walrusClientConfig: unknown;

  class MockSuiClient {
    async getCoins() {
      return { data: [] };
    }

    async signAndExecuteTransaction() {
      return {
        digest: `tx-${Math.random().toString(16).slice(2)}`,
        effects: { status: { status: "success" } }
      };
    }

    async waitForTransaction() {
      return {};
    }
  }

  vi.doMock("@mysten/sui/jsonRpc", () => ({
    SuiJsonRpcClient: MockSuiClient
  }));

  vi.doMock("@mysten/walrus", () => ({
    WalrusClient: class {
      constructor(config: unknown) {
        walrusClientConfig = config;
      }

      writeBlobFlow(input: { blob: Uint8Array }) {
        expect(Buffer.from(input.blob)).toEqual(bundleBytes);
        return {
          encode: vi.fn(async () => undefined),
          register: vi.fn((args: { epochs?: number; owner?: string; deletable?: boolean }) => {
            registerArgs = args;
            return { setGasPayment: vi.fn() };
          }),
          upload: vi.fn(async (args: { digest: string }) => {
            uploadedDigest = args.digest;
          }),
          certify: vi.fn(() => ({ setGasPayment: vi.fn() })),
          getBlob: vi.fn(async () => ({
            blobId: "blob-123",
            blobObject: { id: "0xblob" }
          }))
        };
      }
    },
    blobIdFromInt: (value: string) => `converted-${value}`
  }));

  const { storeArtifact } = await import("../src/walrus.js");
  const keypair = Ed25519Keypair.generate();
  const result = await storeArtifact({
    dataDir: workspace,
    sourcePath,
    artifactDigest: "digest-123",
    walrusNetwork: "testnet",
    walrusUploadRelayUrl: "https://upload-relay.testnet.walrus.space",
    suiRpcUrl: "https://fullnode.testnet.sui.io:443",
    serverSuiPrivateKeys: [keypair.getSecretKey()]
  });

  expect(registerArgs).toMatchObject({
    epochs: 50,
    owner: keypair.getPublicKey().toSuiAddress(),
    deletable: true
  });
  expect(uploadedDigest).toMatch(/^tx-/);
  expect(walrusClientConfig).toMatchObject({
    network: "testnet",
    uploadRelay: {
      host: "https://upload-relay.testnet.walrus.space",
      sendTip: { max: 10_000_000 }
    }
  });
  expect(result).toMatchObject({
    blobId: "blob-123",
    blobObjectId: "0xblob",
    storageDurationEpochs: 50,
    storageMode: "walrus-relay"
  });
  await expect(readFile(result.storedArtifactPath)).resolves.toEqual(bundleBytes);
});
