import { suiClient } from "../config.js";

export const hexToBytes = (hex: string): number[] => {
  const clean = hex.replace(/^0x/, "");
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(Number.parseInt(clean.slice(i, i + 2), 16));
  }

  return bytes;
};

const fieldsAsRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const normalizeMoveBytes = (value: unknown): string => {
  if (!Array.isArray(value)) {
    return "";
  }

  return value.map((byte) => Number(byte).toString(16).padStart(2, "0")).join("");
};

export const resolveAccountId = async (
  accountRegistryId: string,
  ownerAddress: string
): Promise<string | null> => {
  const registry = await suiClient.getObject({
    id: accountRegistryId,
    options: { showContent: true }
  });
  const fields = (registry.data?.content as {
    fields?: { accounts?: { fields?: { id?: { id?: string } } } };
  } | undefined)?.fields;
  const accountsTableId = fields?.accounts?.fields?.id?.id;
  if (!accountsTableId) {
    return null;
  }

  try {
    const entry = await suiClient.getDynamicFieldObject({
      parentId: accountsTableId,
      name: { type: "address", value: ownerAddress }
    });
    return (entry.data?.content as { fields?: { value?: string } } | undefined)?.fields?.value ?? null;
  } catch {
    return null;
  }
};

export const isDelegateKeyRegistered = async (
  accountId: string,
  publicKey: string,
  delegateAddress: string
): Promise<boolean> => {
  const accountObject = await suiClient.getObject({
    id: accountId,
    options: { showContent: true }
  });
  const content = fieldsAsRecord(accountObject.data?.content);
  const fields = fieldsAsRecord(content.fields);
  const delegateKeys = Array.isArray(fields.delegate_keys) ? fields.delegate_keys : [];
  const normalizedPublicKey = publicKey.replace(/^0x/, "").toLowerCase();
  const normalizedDelegateAddress = delegateAddress.toLowerCase();

  return delegateKeys.some((raw) => {
    const keyFields = fieldsAsRecord(fieldsAsRecord(raw).fields);
    return (
      String(keyFields.sui_address ?? "").toLowerCase() === normalizedDelegateAddress ||
      normalizeMoveBytes(keyFields.public_key).toLowerCase() === normalizedPublicKey
    );
  });
};

export const waitForDigest = async (digest: unknown): Promise<void> => {
  if (typeof digest !== "string" || !digest) {
    return;
  }

  await suiClient.waitForTransaction({ digest });
};
