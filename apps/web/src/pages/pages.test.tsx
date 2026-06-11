// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import type { ReactNode } from "react";
import type { RepoListItem } from "@ducnmm/octopus-shared";
import { ViewerProvider } from "../hooks/useViewer.js";
import { HomePage } from "./HomePage.js";
import { RepoPage } from "./RepoPage.js";
import { PullDetailPage } from "./PullDetailPage.js";

const OWNER = "0xowner";

const repoFixture: RepoListItem = {
  owner: OWNER,
  ownerWallet: OWNER,
  name: "demo",
  repoId: `${OWNER}/demo`,
  visibility: "public",
  gitRemotePath: `/${OWNER}/demo.git`,
  repoObjectId: "local:demo",
  defaultBranch: "refs/heads/main",
  defaultBranchCommit: "a".repeat(40),
  refCount: 1,
  refs: [
    {
      name: "refs/heads/main",
      shortName: "main",
      commitDigest: "a".repeat(40),
      updatedAtMs: 1700000000000,
      isDefault: true
    }
  ],
  manifestCount: 1,
  readers: [],
  writers: [],
  commitCount: 1,
  pullRequestCount: 1,
  activityCount: 0,
  createdAtMs: 1700000000000,
  updatedAtMs: 1700000000000
};

const commitFixture = {
  oid: "a".repeat(40),
  parents: [],
  authorName: "Octopus Test",
  authorEmail: "test@octopus.local",
  authoredAt: "2023-11-14T00:00:00Z",
  subject: "initial commit",
  refs: ["refs/heads/main"]
};

const indexFixture = {
  version: 1,
  repoId: repoFixture.repoId,
  owner: OWNER,
  repo: "demo",
  defaultBranch: "refs/heads/main",
  headCommit: commitFixture.oid,
  commitCount: 1,
  treeEntryCount: 1,
  treeTruncated: false,
  commits: [commitFixture],
  treeEntries: [],
  indexedAtMs: 1700000000000
};

const pullFixture = {
  number: 1,
  owner: OWNER,
  repo: "demo",
  repoId: repoFixture.repoId,
  title: "Update README",
  body: "Adds a second line.",
  status: "open",
  baseRef: "refs/heads/main",
  headRef: "refs/heads/feature",
  baseCommit: "a".repeat(40),
  headCommit: "b".repeat(40),
  authorAccountId: "local:author",
  authorWalletAddress: OWNER,
  createdAtMs: 1700000000000,
  updatedAtMs: 1700000000000,
  comments: [{ id: 1, authorAccountId: "local:author", authorWalletAddress: OWNER, body: "First!", createdAtMs: 1700000000000 }]
};

type RouteResponses = Record<string, unknown>;

/** Fetch stub keyed by path prefix; unmatched paths reject with 404 JSON. */
const stubFetch = (routes: RouteResponses, options: { status?: (path: string) => number | undefined } = {}) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://127.0.0.1:48787");
      const path = url.pathname;
      const forcedStatus = options.status?.(path);
      const match = Object.entries(routes).find(([key]) => path === key);
      if (forcedStatus && forcedStatus >= 400) {
        return new Response(JSON.stringify({ error: "denied", code: forcedStatus === 401 ? "login_required" : "repo_locked" }), {
          status: forcedStatus,
          headers: { "content-type": "application/json" }
        });
      }
      if (!match) {
        return new Response(JSON.stringify({ error: `no fixture for ${path}` }), {
          status: 404,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify(match[1]), { status: 200, headers: { "content-type": "application/json" } });
    })
  );
};

const renderAt = (path: string, ui: ReactNode) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ViewerProvider>{ui}</ViewerProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("HomePage", () => {
  it("renders the landing page for signed-out visitors", async () => {
    stubFetch({ "/v1/auth/web-session": { authenticated: false } });
    renderAt("/", <HomePage />);
    await waitFor(() => {
      expect(screen.getByText("GitWal")).toBeTruthy();
    });
    expect(screen.getByText(/Git platform/)).toBeTruthy();
    expect(screen.getByText(/Connect wallet/)).toBeTruthy();
  });

  it("renders the dashboard with repos for signed-in viewers", async () => {
    stubFetch({
      "/v1/auth/web-session": {
        authenticated: true,
        accountId: "local:test",
        walletAddress: OWNER,
        unlockedRepoIds: [],
        expiresAtMs: Date.now() + 60_000
      },
      "/v1/repos": { repos: [repoFixture] }
    });
    renderAt("/", <HomePage />);
    await waitFor(() => {
      expect(screen.getByText("Home")).toBeTruthy();
    });
    expect(screen.getAllByText(repoFixture.repoId).length).toBeGreaterThan(0);
    expect(screen.getAllByText("New repository").length).toBeGreaterThan(0);
  });
});

describe("RepoPage", () => {
  it("renders the file browser, clone box, and README", async () => {
    stubFetch({
      "/v1/auth/web-session": { authenticated: false },
      [`/v1/repos/${OWNER}/demo`]: { repo: repoFixture, contentUnlocked: true },
      [`/v1/repos/${OWNER}/demo/index`]: { index: indexFixture },
      [`/v1/repos/${OWNER}/demo/tree`]: {
        repoId: repoFixture.repoId,
        ref: "main",
        path: "",
        indexedAtMs: 1700000000000,
        entries: [
          { path: "README.md", name: "README.md", mode: "100644", type: "blob", objectId: "c".repeat(40), size: 14 }
        ]
      },
      [`/v1/repos/${OWNER}/demo/commits`]: {
        repoId: repoFixture.repoId,
        ref: "main",
        indexedAtMs: 1700000000000,
        commits: [commitFixture]
      },
      [`/v1/repos/${OWNER}/demo/commit-actors`]: { commitActors: {} },
      [`/v1/repos/${OWNER}/demo/blob`]: {
        repoId: repoFixture.repoId,
        ref: "main",
        indexedAtMs: 1700000000000,
        file: {
          path: "README.md",
          objectId: "c".repeat(40),
          size: 14,
          encoding: "utf8",
          content: "# hello octopus\n",
          truncated: false
        }
      }
    });

    render(
      <MemoryRouter initialEntries={[`/${OWNER}/demo`]}>
        <ViewerProvider>
          <Routes>
            <Route path="/:owner/:repo" element={<RepoPage />} />
          </Routes>
        </ViewerProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText("README.md").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("initial commit").length).toBeGreaterThan(0);
    expect(screen.getByText("hello octopus")).toBeTruthy();
    expect(screen.getByText("1 branch")).toBeTruthy();
  });
});

describe("private repo guard", () => {
  it("redirects to the login flow when the API returns 401 login_required", async () => {
    const assignSpy = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign: assignSpy, origin: "http://127.0.0.1:45173" });
    stubFetch(
      { "/v1/auth/web-session": { authenticated: false } },
      { status: (path) => (path === `/v1/repos/${OWNER}/secret` ? 401 : undefined) }
    );

    render(
      <MemoryRouter initialEntries={[`/${OWNER}/secret`]}>
        <ViewerProvider>
          <Routes>
            <Route path="/:owner/:repo" element={<RepoPage />} />
          </Routes>
        </ViewerProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalled();
    });
    const target = String(assignSpy.mock.calls[0]?.[0]);
    expect(target).toContain("/login?");
    expect(target).toContain("mode=web");
    expect(target).toContain("autostart=1");
  });
});

describe("PullDetailPage", () => {
  it("renders PR title, comparison stats, and comments", async () => {
    stubFetch({
      "/v1/auth/web-session": { authenticated: false },
      [`/v1/repos/${OWNER}/demo`]: { repo: repoFixture, contentUnlocked: true },
      [`/v1/repos/${OWNER}/demo/pulls/1`]: {
        pullRequest: pullFixture,
        comparison: {
          baseCommit: pullFixture.baseCommit,
          headCommit: pullFixture.headCommit,
          mergeBaseCommit: pullFixture.baseCommit,
          commits: [commitFixture],
          files: [{ path: "README.md", additions: 1, deletions: 0, binary: false }],
          commitCount: 1,
          fileCount: 1,
          additions: 1,
          deletions: 0,
          patch: "",
          patchTruncated: false
        },
        mergeability: { mergeable: true }
      },
      [`/v1/repos/${OWNER}/demo/commit-actors`]: { commitActors: {} }
    });

    render(
      <MemoryRouter initialEntries={[`/${OWNER}/demo/pulls/1`]}>
        <ViewerProvider>
          <Routes>
            <Route path="/:owner/:repo/pulls/:number" element={<PullDetailPage />} />
          </Routes>
        </ViewerProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Update README")).toBeTruthy();
    });
    expect(screen.getByText("Adds a second line.")).toBeTruthy();
    expect(screen.getByText("1 commit")).toBeTruthy();
    expect(screen.getByText("1 file")).toBeTruthy();
    expect(screen.getByText("First!")).toBeTruthy();
    expect(screen.getByText("1 comment")).toBeTruthy();
  });
});
