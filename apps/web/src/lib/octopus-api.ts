import type {
  BlobView,
  CommitActorMap,
  IndexedCommit,
  PullRequest,
  PullRequestComment,
  PullRequestComparison,
  PullRequestMergeability,
  PullRequestStatusFilter,
  RepoActivityItem,
  RepoIndex,
  RepoListItem,
  TreeEntry
} from "@ducnmm/octopus-shared";

/**
 * Where the JSON API lives. An explicit VITE_OCTOPUS_SERVER_URL always wins;
 * dev falls back to the local server; in production the SPA is served by the
 * Octopus server itself, so same-origin is correct.
 */
export const apiOrigin: string =
  (import.meta.env.VITE_OCTOPUS_SERVER_URL as string | undefined) ??
  (import.meta.env.DEV ? "http://127.0.0.1:48787" : window.location.origin);

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export const apiUrl = (path: string): string => `${apiOrigin.replace(/\/+$/, "")}${path}`;

export const apiFetch = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let code: string | undefined;
    try {
      const body = (await response.json()) as { error?: string; code?: string };
      if (body.error) {
        message = body.error;
      }
      code = body.code;
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new ApiError(message, response.status, code);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
};

export type WebSessionInfo =
  | { authenticated: false }
  | {
      authenticated: true;
      accountId: string;
      walletAddress: string;
      unlockedRepoIds: string[];
      expiresAtMs: number;
    };

const e = encodeURIComponent;

export const api = {
  webSession: () => apiFetch<WebSessionInfo>("/v1/auth/web-session"),

  repos: () => apiFetch<{ repos: RepoListItem[] }>("/v1/repos"),

  repo: (owner: string, repo: string) =>
    apiFetch<{ repo: RepoListItem; contentUnlocked: boolean }>(`/v1/repos/${e(owner)}/${e(repo)}`),

  repoIndex: (owner: string, repo: string) =>
    apiFetch<{ index: RepoIndex }>(`/v1/repos/${e(owner)}/${e(repo)}/index`),

  commits: (owner: string, repo: string, options: { ref?: string; limit?: number } = {}) => {
    const query = new URLSearchParams();
    if (options.ref) query.set("ref", options.ref);
    if (options.limit) query.set("limit", String(options.limit));
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return apiFetch<{ repoId: string; ref: string; indexedAtMs: number; commits: IndexedCommit[] }>(
      `/v1/repos/${e(owner)}/${e(repo)}/commits${suffix}`
    );
  },

  tree: (owner: string, repo: string, options: { ref?: string; path?: string } = {}) => {
    const query = new URLSearchParams();
    if (options.ref) query.set("ref", options.ref);
    if (options.path) query.set("path", options.path);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return apiFetch<{ repoId: string; ref: string; path: string; indexedAtMs: number; entries: TreeEntry[] }>(
      `/v1/repos/${e(owner)}/${e(repo)}/tree${suffix}`
    );
  },

  blob: (owner: string, repo: string, options: { ref?: string; path: string }) => {
    const query = new URLSearchParams();
    if (options.ref) query.set("ref", options.ref);
    query.set("path", options.path);
    return apiFetch<{ repoId: string; ref: string; indexedAtMs: number; file: BlobView }>(
      `/v1/repos/${e(owner)}/${e(repo)}/blob?${query.toString()}`
    );
  },

  activity: (owner: string, repo: string) =>
    apiFetch<{ repo: RepoListItem; activity: RepoActivityItem[] }>(`/v1/repos/${e(owner)}/${e(repo)}/activity`),

  commitActors: (owner: string, repo: string) =>
    apiFetch<{ commitActors: CommitActorMap }>(`/v1/repos/${e(owner)}/${e(repo)}/commit-actors`),

  createRepo: (input: { owner?: string; name: string; visibility: "public" | "private" }) =>
    apiFetch<{ owner: string; name: string; visibility: string; gitRemotePath: string }>("/v1/repos", {
      method: "POST",
      body: JSON.stringify(input)
    }),

  pulls: (owner: string, repo: string, status: PullRequestStatusFilter = "all") =>
    apiFetch<{ pullRequests: PullRequest[] }>(`/v1/repos/${e(owner)}/${e(repo)}/pulls?status=${e(status)}`),

  pull: (owner: string, repo: string, pull: number) =>
    apiFetch<{
      pullRequest: PullRequest;
      comparison: PullRequestComparison;
      mergeability: PullRequestMergeability;
    }>(`/v1/repos/${e(owner)}/${e(repo)}/pulls/${pull}`),

  createPull: (owner: string, repo: string, input: { title: string; body?: string; baseRef?: string; headRef: string }) =>
    apiFetch<{ pullRequest: PullRequest }>(`/v1/repos/${e(owner)}/${e(repo)}/pulls`, {
      method: "POST",
      body: JSON.stringify(input)
    }),

  mergePull: (
    owner: string,
    repo: string,
    pull: number,
    input: { strategy?: string; expectedHeadCommit?: string; deleteBranch?: boolean } = {}
  ) =>
    apiFetch<{ pullRequest: PullRequest }>(`/v1/repos/${e(owner)}/${e(repo)}/pulls/${pull}/merge`, {
      method: "POST",
      body: JSON.stringify(input)
    }),

  closePull: (owner: string, repo: string, pull: number) =>
    apiFetch<{ pullRequest: PullRequest }>(`/v1/repos/${e(owner)}/${e(repo)}/pulls/${pull}/close`, {
      method: "POST",
      body: JSON.stringify({})
    }),

  reopenPull: (owner: string, repo: string, pull: number) =>
    apiFetch<{ pullRequest: PullRequest }>(`/v1/repos/${e(owner)}/${e(repo)}/pulls/${pull}/reopen`, {
      method: "POST",
      body: JSON.stringify({})
    }),

  addPullComment: (owner: string, repo: string, pull: number, body: string) =>
    apiFetch<{ comment: PullRequestComment }>(`/v1/repos/${e(owner)}/${e(repo)}/pulls/${pull}/comments`, {
      method: "POST",
      body: JSON.stringify({ body })
    }),

  updateContributor: (
    owner: string,
    repo: string,
    input: { walletAddress: string; role: "reader" | "writer"; action: "add" | "remove" }
  ) =>
    apiFetch<{ repo: RepoListItem }>(`/${e(owner)}/${e(repo)}/contributors`, {
      method: "POST",
      body: JSON.stringify(input)
    }),

  logout: () =>
    fetch(apiUrl("/logout"), {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: ""
    })
};
