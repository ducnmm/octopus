import {
  createPullRequestCommentRequestSchema,
  createPullRequestRequestSchema,
  createRepoRequestSchema,
  mergePullRequestRequestSchema
} from "@ducnmm/octopus-shared";
import type { SuiRepoAccessAction, SuiRepoAccessRole } from "../sui.js";
import { httpError } from "./http-error.js";
import { isRecord } from "./web-session.js";

export const queryString = (value: unknown): string | undefined => {
  return typeof value === "string" && value.trim() ? value : undefined;
};

export const queryInt = (value: unknown, fallback: number): number => {
  if (typeof value !== "string") {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const requestOrigin = (request: { headers: Record<string, unknown>; protocol?: string }): string | undefined => {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const forwardedHost = request.headers["x-forwarded-host"];
  const host =
    typeof forwardedHost === "string"
      ? forwardedHost.split(",")[0]?.trim()
      : typeof request.headers.host === "string"
        ? request.headers.host
        : undefined;
  if (!host) {
    return undefined;
  }
  const protocol =
    typeof forwardedProto === "string" ? forwardedProto.split(",")[0]?.trim() : (request.protocol ?? "http");
  return `${protocol || "http"}://${host}`;
};

export const normalizeReturnTo = (value: unknown, origin?: string): string => {
  const text = typeof value === "string" && value.trim() ? value.trim() : "/";
  if (text.startsWith("/") && !text.startsWith("//")) {
    return text;
  }

  try {
    const base = origin ?? "http://127.0.0.1";
    const url = new URL(text, base);
    if (!origin || url.origin === origin) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return "/";
  }

  return "/";
};

export const pullRequestNumber = (value: unknown): number => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^[1-9][0-9]*$/.test(text)) {
    throw httpError("Pull request number must be a positive integer", 400);
  }
  return Number.parseInt(text, 10);
};

export const requestBodyRecord = (body: unknown): Record<string, string> => {
  if (typeof body === "string") {
    return Object.fromEntries(new URLSearchParams(body).entries());
  }
  if (!isRecord(body)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(body).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
};

export const normalizedWalletAddress = (value: unknown): string => {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^0x[0-9a-f]+$/.test(text) || text.length > 66) {
    throw httpError("Contributor wallet address must be a Sui address", 400);
  }
  return text;
};

export const accessRole = (value: unknown): SuiRepoAccessRole => {
  return value === "reader" ? "reader" : "writer";
};

export const accessAction = (value: unknown): SuiRepoAccessAction => {
  return value === "remove" ? "remove" : "add";
};

export const repoAccessFunctionName = (
  action: SuiRepoAccessAction,
  role: SuiRepoAccessRole
): "add_member" | "add_reader" | "remove_member" | "remove_reader" => {
  if (action === "remove") {
    return role === "reader" ? "remove_reader" : "remove_member";
  }

  return role === "reader" ? "add_reader" : "add_member";
};

export const createPullRequestInput = (body: unknown) => {
  try {
    return createPullRequestRequestSchema.parse(requestBodyRecord(body));
  } catch (error) {
    throw httpError(error instanceof Error ? error.message : "Invalid pull request input", 400);
  }
};

// Unlike requestBodyRecord this keeps non-string values (JSON booleans).
const looseBodyRecord = (body: unknown): Record<string, unknown> => {
  if (typeof body === "string") {
    return Object.fromEntries(new URLSearchParams(body).entries());
  }
  return isRecord(body) ? body : {};
};

export const mergePullRequestInput = (body: unknown) => {
  try {
    return mergePullRequestRequestSchema.parse(looseBodyRecord(body));
  } catch (error) {
    throw httpError(error instanceof Error ? error.message : "Invalid merge input", 400);
  }
};

export const pullRequestCommentInput = (body: unknown) => {
  try {
    return createPullRequestCommentRequestSchema.parse(looseBodyRecord(body));
  } catch {
    throw httpError("Comment body must be between 1 and 10,000 characters", 400);
  }
};

export const pullRequestStatusFilter = (value: unknown, fallback: "open" | "all"): "open" | "closed" | "merged" | "all" => {
  return value === "open" || value === "closed" || value === "merged" || value === "all"
    ? value
    : fallback;
};

export const createRepoInput = (body: unknown) => {
  const record = requestBodyRecord(body);
  const input = {
    owner: record.owner?.trim() || undefined,
    name: record.name?.trim(),
    visibility: record.visibility?.trim() || undefined
  };

  try {
    return createRepoRequestSchema.parse(input);
  } catch (error) {
    throw httpError(error instanceof Error ? error.message : "Invalid repository input", 400);
  }
};

export const isFormPost = (request: { body: unknown; headers: Record<string, unknown> }): boolean => {
  return (
    typeof request.body === "string" ||
    String(request.headers["content-type"] ?? "").includes("application/x-www-form-urlencoded")
  );
};
