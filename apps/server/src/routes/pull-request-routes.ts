import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthContext } from "../auth.js";
import { httpError } from "../lib/http-error.js";
import {
  createPullRequestInput,
  isFormPost,
  mergePullRequestInput,
  pullRequestCommentInput,
  pullRequestNumber,
  pullRequestStatusFilter,
  queryString,
  requestBodyRecord
} from "../lib/request-helpers.js";
import { webViewerFromRequest } from "../plugins/auth-context.js";
import type { SuiRepoState } from "../sui.js";
import { renderPullRequestCreatePage, renderPullRequestListPage, renderPullRequestPage } from "@octopus/web/views/pages.js";
import type { RouteDeps } from "./index.js";

type PullParams = { Params: { owner: string; repo: string; pull: string } };
type RepoParams = { Params: { owner: string; repo: string } };

export const pullRequestRoutes = async (app: FastifyInstance, deps: RouteDeps) => {
  const { repositories: repos, services, ctx } = deps;

  const requireAuthContext = async (request: FastifyRequest, message: string): Promise<AuthContext> => {
    const auth = await ctx.requestAuthContext(request);
    if (!auth) {
      throw httpError(message, 401);
    }
    return auth;
  };

  app.get<RepoParams & { Querystring: { status?: string } }>("/v1/repos/:owner/:repo/pulls", async (request) => {
    const state = await ctx.authorizedRepoState(request, request.params.owner, request.params.repo);
    ctx.requireRepoContentAccess(request, state);
    const status = pullRequestStatusFilter(request.query.status, "all");
    return { pullRequests: await services.pullRequestService.list(state.owner, state.repo, status) };
  });

  app.post<RepoParams>("/v1/repos/:owner/:repo/pulls", async (request, reply) => {
    const state = await ctx.authorizedRepoState(request, request.params.owner, request.params.repo);
    ctx.requireRepoContentAccess(request, state);
    const auth = await requireAuthContext(request, "Authentication is required to open a pull request");
    const pullRequest = await services.pullRequestService.create(state, createPullRequestInput(request.body), auth);
    await reply.code(201).send({ pullRequest });
  });

  app.get<PullParams>("/v1/repos/:owner/:repo/pulls/:pull", async (request) => {
    const state = await ctx.authorizedRepoState(request, request.params.owner, request.params.repo);
    ctx.requireRepoContentAccess(request, state);
    return await services.pullRequestService.readWithComparison(state, pullRequestNumber(request.params.pull));
  });

  app.post<PullParams>("/v1/repos/:owner/:repo/pulls/:pull/merge", async (request) => {
    const state = await ctx.authorizedRepoState(request, request.params.owner, request.params.repo);
    ctx.requireRepoContentAccess(request, state);
    const auth = await requireAuthContext(request, "Authentication is required to merge a pull request");
    const result = await services.pullRequestService.merge(
      state,
      pullRequestNumber(request.params.pull),
      mergePullRequestInput(request.body),
      auth
    );
    return result;
  });

  app.post<PullParams>("/v1/repos/:owner/:repo/pulls/:pull/close", async (request) => {
    const state = await ctx.authorizedRepoState(request, request.params.owner, request.params.repo);
    ctx.requireRepoContentAccess(request, state);
    const auth = await requireAuthContext(request, "Authentication is required to close a pull request");
    return {
      pullRequest: await services.pullRequestService.close(state, pullRequestNumber(request.params.pull), auth)
    };
  });

  app.post<PullParams>("/v1/repos/:owner/:repo/pulls/:pull/reopen", async (request) => {
    const state = await ctx.authorizedRepoState(request, request.params.owner, request.params.repo);
    ctx.requireRepoContentAccess(request, state);
    const auth = await requireAuthContext(request, "Authentication is required to reopen a pull request");
    return {
      pullRequest: await services.pullRequestService.reopen(state, pullRequestNumber(request.params.pull), auth)
    };
  });

  app.get<PullParams>("/v1/repos/:owner/:repo/pulls/:pull/comments", async (request) => {
    const state = await ctx.authorizedRepoState(request, request.params.owner, request.params.repo);
    ctx.requireRepoContentAccess(request, state);
    return { comments: await services.pullRequestService.listComments(state, pullRequestNumber(request.params.pull)) };
  });

  app.post<PullParams>("/v1/repos/:owner/:repo/pulls/:pull/comments", async (request, reply) => {
    const state = await ctx.authorizedRepoState(request, request.params.owner, request.params.repo);
    ctx.requireRepoContentAccess(request, state);
    const auth = await requireAuthContext(request, "Authentication is required to comment on a pull request");
    const { comment } = await services.pullRequestService.addComment(
      state,
      pullRequestNumber(request.params.pull),
      pullRequestCommentInput(request.body).body,
      auth
    );
    await reply.code(201).send({ comment });
  });

  app.get<RepoParams & { Querystring: { status?: string } }>("/:owner/:repo/pulls", async (request, reply) => {
    const state = await ctx.authorizedHtmlRepoContentState(request, reply);
    if (!state) {
      return;
    }

    const status = pullRequestStatusFilter(request.query.status, "open");
    const pullRequests = await services.pullRequestService.list(state.owner, state.repo, status);
    const allPullRequests =
      status === "all" ? pullRequests : await services.pullRequestService.list(state.owner, state.repo, "all");
    await reply.type("text/html; charset=utf-8").send(
      renderPullRequestListPage({
        repo: await services.repoService.listItemWithCounts(state, { pullRequests: allPullRequests }),
        pullRequests,
        allPullRequests,
        status,
        viewer: webViewerFromRequest(request)
      })
    );
  });

  app.post<RepoParams>("/:owner/:repo/pulls", async (request, reply) => {
    const state = await ctx.authorizedHtmlRepoContentState(request, reply);
    if (!state) {
      return;
    }

    const auth = await requireAuthContext(request, "Sign in before opening a pull request");
    const pullRequest = await services.pullRequestService.create(state, createPullRequestInput(request.body), auth);
    if (isFormPost(request)) {
      await reply
        .code(303)
        .header(
          "location",
          `/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.repo)}/pulls/${pullRequest.number}`
        )
        .send();
      return;
    }

    await reply.code(201).send({ pullRequest });
  });

  app.get<RepoParams>("/:owner/:repo/pulls/new", async (request, reply) => {
    const state = await ctx.authorizedHtmlRepoContentState(request, reply);
    if (!state) {
      return;
    }

    const auth = await requireAuthContext(request, "Sign in before opening a pull request");
    if (!repos.sui.canWrite(state, auth)) {
      throw httpError("Write access is required to open a pull request", 403);
    }

    await reply.type("text/html; charset=utf-8").send(
      renderPullRequestCreatePage({
        repo: await services.repoService.listItemWithCounts(state),
        viewer: webViewerFromRequest(request) ?? { walletAddress: auth.walletAddress }
      })
    );
  });

  app.get<PullParams & { Querystring: { error?: string } }>("/:owner/:repo/pulls/:pull", async (request, reply) => {
    const state = await ctx.authorizedHtmlRepoContentState(request, reply);
    if (!state) {
      return;
    }

    const { pullRequest, comparison, mergeability } = await services.pullRequestService.readWithComparison(
      state,
      pullRequestNumber(request.params.pull)
    );
    const repoPath = repos.git.path(state.owner, state.repo);

    await reply.type("text/html; charset=utf-8").send(
      renderPullRequestPage({
        repo: await services.repoService.listItemWithCounts(state),
        pullRequest,
        comparison,
        mergeability,
        commitActors: await repos.commitActors.read(state, repoPath),
        viewer: webViewerFromRequest(request),
        errorMessage: queryString(request.query.error)
      })
    );
  });

  // Web form actions: redirect back to the PR page, carrying failures in the
  // `error` query parameter so the page can surface them.
  const pullRequestPagePath = (state: SuiRepoState, pull: number, error?: string): string => {
    const base = `/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.repo)}/pulls/${pull}`;
    return error ? `${base}?error=${encodeURIComponent(error)}` : base;
  };

  const webPullRequestAction = (
    action: (state: SuiRepoState, pull: number, request: FastifyRequest<PullParams>) => Promise<void>
  ) => {
    return async (request: FastifyRequest<PullParams>, reply: FastifyReply): Promise<void> => {
      const state = await ctx.authorizedHtmlRepoContentState(request, reply);
      if (!state) {
        return;
      }

      const pull = pullRequestNumber(request.params.pull);
      let error: string | undefined;
      try {
        await action(state, pull, request);
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
      }
      await reply
        .code(303)
        .header("location", pullRequestPagePath(state, pull, error))
        .send();
    };
  };

  app.post<PullParams>(
    "/:owner/:repo/pulls/:pull/merge",
    webPullRequestAction(async (state, pull, request) => {
      const auth = await requireAuthContext(request, "Sign in before merging a pull request");
      await services.pullRequestService.merge(state, pull, mergePullRequestInput(request.body), auth);
    })
  );

  app.post<PullParams>(
    "/:owner/:repo/pulls/:pull/close",
    webPullRequestAction(async (state, pull, request) => {
      const auth = await requireAuthContext(request, "Sign in before closing a pull request");
      await services.pullRequestService.close(state, pull, auth);
    })
  );

  app.post<PullParams>(
    "/:owner/:repo/pulls/:pull/reopen",
    webPullRequestAction(async (state, pull, request) => {
      const auth = await requireAuthContext(request, "Sign in before reopening a pull request");
      await services.pullRequestService.reopen(state, pull, auth);
    })
  );

  app.post<PullParams>(
    "/:owner/:repo/pulls/:pull/comments",
    webPullRequestAction(async (state, pull, request) => {
      const auth = await requireAuthContext(request, "Sign in before commenting on a pull request");
      const body = requestBodyRecord(request.body).body ?? "";
      await services.pullRequestService.addComment(state, pull, pullRequestCommentInput({ body }).body, auth);
    })
  );
};
