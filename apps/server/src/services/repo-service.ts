import { mkdir } from "node:fs/promises";
import type { AuthContext } from "../auth.js";
import type { ServerConfig } from "../config/env.js";
import { httpError } from "../lib/http-error.js";
import { resolveRepoOwnerNamespace } from "../namespace.js";
import type { Repositories } from "../repositories/index.js";
import type { SuiRepoState } from "../sui.js";
import { toRepoListItem } from "@octopus/web/views/pages.js";

type RepoIndex = Awaited<ReturnType<Repositories["index"]["ensure"]>>;
type PullRequestList = Awaited<ReturnType<Repositories["pullRequests"]["list"]>>;
type ActivityList = Awaited<ReturnType<Repositories["activity"]["list"]>>;

type RepoCreateInput = {
  owner?: string;
  name: string;
  visibility: Parameters<Repositories["sui"]["ensureRepo"]>[0]["visibility"];
};

/** Repository read/list/create orchestration and authorization checks. */
export const createRepoService = (config: ServerConfig, repos: Repositories) => {
  const openPullRequestCount = (pullRequests: PullRequestList): number =>
    pullRequests.filter((pullRequest) => pullRequest.status === "open").length;

  const listVisible = async (auth: AuthContext | null) => {
    const states = await repos.sui.listStates();
    return await Promise.all(
      states
        .filter((state) => repos.sui.canRead(state, auth))
        .map(async (state) => {
          const item = toRepoListItem(state);
          try {
            const index = await repos.index.ensure(state);
            return {
              ...item,
              commitCount: index.commitCount,
              commitDates: index.commits.map((commit) => commit.authoredAt)
            };
          } catch {
            return item;
          }
        })
    );
  };

  const listItemWithCounts = async (
    state: SuiRepoState,
    known: { index?: RepoIndex; pullRequests?: PullRequestList; activity?: ActivityList } = {}
  ) => {
    const [index, pullRequests, activity] = await Promise.all([
      known.index ? Promise.resolve(known.index) : repos.index.ensure(state).catch(() => null),
      known.pullRequests
        ? Promise.resolve(known.pullRequests)
        : repos.pullRequests.list(state.owner, state.repo).catch(() => []),
      known.activity ? Promise.resolve(known.activity) : repos.activity.list(state).catch(() => [])
    ]);

    return {
      ...toRepoListItem(state),
      ...(index
        ? { commitCount: index.commitCount, commitDates: index.commits.map((commit) => commit.authoredAt) }
        : {}),
      pullRequestCount: openPullRequestCount(pullRequests),
      activityCount: activity.length
    };
  };

  const getAuthorizedState = async (owner: string, repo: string, auth: AuthContext | null): Promise<SuiRepoState> => {
    const state = await repos.sui.readState(owner, repo);
    if (!state) {
      throw httpError("Repository state not found", 404);
    }

    if (state.visibility === "private" && !repos.sui.canRead(state, auth)) {
      throw httpError("Not authorized to read this repository", auth ? 403 : 401);
    }

    return state;
  };

  const create = async (auth: AuthContext, input: RepoCreateInput) => {
    const owner = await resolveRepoOwnerNamespace(config, auth, input.owner);
    await mkdir(config.repoRoot, { recursive: true });
    await repos.git.init(owner, input.name);
    const suiRepo = await repos.sui.ensureRepo(
      {
        owner,
        repo: input.name,
        visibility: input.visibility,
        accountId: auth.accountId,
        ownerWallet: auth.walletAddress
      },
      auth
    );
    return { owner, suiRepo };
  };

  const updateAccess = async (
    state: Parameters<Repositories["sui"]["updateAccess"]>[0],
    change: Parameters<Repositories["sui"]["updateAccess"]>[1],
    actorWalletAddress: string,
    txDigest?: string
  ) => {
    const updated = await repos.sui.updateAccess(state, change);
    await repos.activity.recordAccess({
      owner: state.owner,
      repo: state.repo,
      repoId: state.repoId,
      walletAddress: change.walletAddress,
      role: change.role,
      action: change.action,
      actorWalletAddress,
      txDigest,
      createdAtMs: Date.now()
    });
    return updated;
  };

  return { openPullRequestCount, listVisible, listItemWithCounts, getAuthorizedState, create, updateAccess };
};

export type RepoService = ReturnType<typeof createRepoService>;
