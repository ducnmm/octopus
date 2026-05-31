const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
};

const copiedErrorKeys = [
  "code",
  "errno",
  "syscall",
  "hostname",
  "host",
  "port",
  "address",
  "status",
  "statusCode",
  "method",
  "url"
];

export const serializeError = (error: unknown, depth = 0): Record<string, unknown> => {
  if (error instanceof Error) {
    const details: Record<string, unknown> = {
      name: error.name,
      message: error.message
    };

    if (error.stack) {
      details.stack = error.stack;
    }

    const record = error as Error & Record<string, unknown>;
    for (const key of copiedErrorKeys) {
      const value = record[key];
      if (value !== undefined && typeof value !== "function") {
        details[key] = value;
      }
    }

    const cause = record.cause;
    if (cause !== undefined && depth < 4) {
      details.cause = serializeError(cause, depth + 1);
    }

    return details;
  }

  if (isRecord(error)) {
    const details: Record<string, unknown> = {};
    for (const key of copiedErrorKeys) {
      const value = error[key];
      if (value !== undefined && typeof value !== "function") {
        details[key] = value;
      }
    }
    if (typeof error.message === "string") {
      details.message = error.message;
    }
    if (error.cause !== undefined && depth < 4) {
      details.cause = serializeError(error.cause, depth + 1);
    }
    return Object.keys(details).length > 0 ? details : { message: JSON.stringify(error) };
  }

  return { message: String(error) };
};
