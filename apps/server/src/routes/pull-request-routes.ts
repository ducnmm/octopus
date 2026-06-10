import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AuthContext } from "../auth.js";
import { httpError } from "../lib/http-error.js";
import {
  createPullRequestInput,
  mergePullRequestInput,
  pullRequestCommentInput,
  pullRequestNumber,
  pullRequestStatusFilter
} from "../lib/request-helpers.js";
import type { RouteDeps } from "./index.js";

type PullParams = { Params: { owner: string; repo: string; pull: string } };
type RepoParams = { Params: { owner: string; repo: string } };

export const pullRequestRoutes = async (app: FastifyInstance, deps: RouteDeps) => {
  const { services, ctx } = deps;

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

};
