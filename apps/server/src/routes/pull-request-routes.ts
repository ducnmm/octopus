import type { FastifyInstance } from "fastify";
import { httpError } from "../lib/http-error.js";
import { createPullRequestInput, isFormPost, pullRequestNumber } from "../lib/request-helpers.js";
import { webViewerFromRequest } from "../plugins/auth-context.js";
import { renderPullRequestCreatePage, renderPullRequestListPage, renderPullRequestPage } from "../views/pages.js";
import type { RouteDeps } from "./index.js";

export const pullRequestRoutes = async (app: FastifyInstance, deps: RouteDeps) => {
  const { repositories: repos, services, ctx } = deps;

  app.get<{ Params: { owner: string; repo: string } }>("/v1/repos/:owner/:repo/pulls", async (request) => {
    const state = await ctx.authorizedRepoState(request, request.params.owner, request.params.repo);
    ctx.requireRepoContentAccess(request, state);
    return { pullRequests: await services.pullRequestService.list(state.owner, state.repo) };
  });

  app.post<{ Params: { owner: string; repo: string } }>("/v1/repos/:owner/:repo/pulls", async (request, reply) => {
    const state = await ctx.authorizedRepoState(request, request.params.owner, request.params.repo);
    ctx.requireRepoContentAccess(request, state);
    const auth = await ctx.requestAuthContext(request);
    if (!auth) {
      throw httpError("Authentication is required to open a pull request", 401);
    }

    const pullRequest = await services.pullRequestService.create(state, createPullRequestInput(request.body), auth);
    await reply.code(201).send({ pullRequest });
  });

  app.get<{ Params: { owner: string; repo: string; pull: string } }>(
    "/v1/repos/:owner/:repo/pulls/:pull",
    async (request) => {
      const state = await ctx.authorizedRepoState(request, request.params.owner, request.params.repo);
      ctx.requireRepoContentAccess(request, state);
      return await services.pullRequestService.readWithComparison(state, pullRequestNumber(request.params.pull));
    }
  );

  app.get<{ Params: { owner: string; repo: string } }>("/:owner/:repo/pulls", async (request, reply) => {
    const state = await ctx.authorizedHtmlRepoContentState(request, reply);
    if (!state) {
      return;
    }

    const pullRequests = await services.pullRequestService.list(state.owner, state.repo);
    await reply.type("text/html; charset=utf-8").send(
      renderPullRequestListPage({
        repo: await services.repoService.listItemWithCounts(state, { pullRequests }),
        pullRequests,
        viewer: webViewerFromRequest(request)
      })
    );
  });

  app.post<{ Params: { owner: string; repo: string } }>("/:owner/:repo/pulls", async (request, reply) => {
    const state = await ctx.authorizedHtmlRepoContentState(request, reply);
    if (!state) {
      return;
    }

    const auth = await ctx.requestAuthContext(request);
    if (!auth) {
      throw httpError("Sign in before opening a pull request", 401);
    }

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

  app.get<{ Params: { owner: string; repo: string } }>("/:owner/:repo/pulls/new", async (request, reply) => {
    const state = await ctx.authorizedHtmlRepoContentState(request, reply);
    if (!state) {
      return;
    }

    const auth = await ctx.requestAuthContext(request);
    if (!auth) {
      throw httpError("Sign in before opening a pull request", 401);
    }
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

  app.get<{ Params: { owner: string; repo: string; pull: string } }>(
    "/:owner/:repo/pulls/:pull",
    async (request, reply) => {
      const state = await ctx.authorizedHtmlRepoContentState(request, reply);
      if (!state) {
        return;
      }

      const { pullRequest, comparison } = await services.pullRequestService.readWithComparison(
        state,
        pullRequestNumber(request.params.pull)
      );
      const repoPath = repos.git.path(state.owner, state.repo);

      await reply.type("text/html; charset=utf-8").send(
        renderPullRequestPage({
          repo: await services.repoService.listItemWithCounts(state),
          pullRequest,
          comparison,
          commitActors: await repos.commitActors.read(state, repoPath),
          viewer: webViewerFromRequest(request)
        })
      );
    }
  );
};
