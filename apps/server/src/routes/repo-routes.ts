import { Transaction } from "@mysten/sui/transactions";
import type { FastifyInstance } from "fastify";
import { parseDelegateAuth, type AuthContext } from "../auth.js";
import type { BlobView, TreeEntry } from "../indexer.js";
import { httpError } from "../lib/http-error.js";
import {
  accessAction,
  accessRole,
  createRepoInput,
  isFormPost,
  normalizedWalletAddress,
  normalizeReturnTo,
  queryInt,
  queryString,
  repoAccessFunctionName,
  requestBodyRecord,
  requestOrigin
} from "../lib/request-helpers.js";
import { webViewerFromRequest } from "../plugins/auth-context.js";
import type { Repositories } from "../repositories/index.js";
import {
  renderBlobPage,
  renderCommitsPage,
  renderCreateRepoPage,
  renderDashboardPage,
  renderLandingPage,
  renderProfilePage,
  renderRepoAccessPage,
  renderRepoActivityPage,
  renderRepoPage,
  toRepoListItem
} from "@octopus/web/views/pages.js";
import type { RouteDeps } from "./index.js";

const readReadmePreview = async (
  repos: Repositories,
  repoPath: string,
  path: string,
  ref: string,
  tree: TreeEntry[]
): Promise<BlobView | null> => {
  if (path) {
    return null;
  }

  const readme = tree.find(
    (entry) => entry.type === "blob" && !entry.path.includes("/") && /^readme(?:\..*)?$/i.test(entry.path)
  );
  if (!readme) {
    return null;
  }

  try {
    return await repos.index.blob(repoPath, ref, readme.path);
  } catch {
    return null;
  }
};

export const repoRoutes = async (app: FastifyInstance, deps: RouteDeps) => {
  const { config, repositories: repos, services, ctx } = deps;

  app.post<{ Params: { owner: string; repo: string } }>("/:owner/:repo/contributors", async (request, reply) => {
    const state = await repos.sui.readState(request.params.owner, request.params.repo);
    if (!state) {
      throw httpError("Repository state not found", 404);
    }

    const auth = await ctx.requestAuthContext(request);
    if (!auth) {
      throw httpError("Sign in before managing contributors", 401);
    }
    if (!repos.sui.canManageAccess(state, auth)) {
      throw httpError("Only the repository owner can manage contributors", 403);
    }

    const body = requestBodyRecord(request.body);
    const walletAddress = normalizedWalletAddress(body.walletAddress);
    if (walletAddress === state.ownerWallet.toLowerCase() || walletAddress === state.owner.toLowerCase()) {
      throw httpError("The owner already has full repository access", 400);
    }

    const updated = await services.repoService.updateAccess(
      state,
      { walletAddress, role: accessRole(body.role), action: accessAction(body.action) },
      auth.walletAddress
    );

    if (isFormPost(request)) {
      const returnTo = normalizeReturnTo(body.returnTo, requestOrigin(request));
      await reply
        .code(303)
        .header(
          "location",
          returnTo === "/" ? `/${encodeURIComponent(updated.owner)}/${encodeURIComponent(updated.repo)}` : returnTo
        )
        .send();
      return;
    }

    await reply.header("cache-control", "no-store").send({ repo: toRepoListItem(updated) });
  });

  app.get<{ Params: { owner: string; repo: string } }>("/v1/repos/:owner/:repo/activity", async (request) => {
    const state = await ctx.authorizedRepoState(request, request.params.owner, request.params.repo);
    ctx.requireRepoContentAccess(request, state);
    return { repo: toRepoListItem(state), activity: await repos.activity.list(state) };
  });

  app.post<{ Params: { owner: string; repo: string } }>(
    "/v1/repos/:owner/:repo/access-transaction",
    async (request, reply) => {
      const state = await repos.sui.readState(request.params.owner, request.params.repo);
      if (!state) {
        throw httpError("Repository state not found", 404);
      }

      const auth = await ctx.requestAuthContext(request);
      if (!auth) {
        throw httpError("Sign in before managing contributors", 401);
      }
      if (!repos.sui.canManageAccess(state, auth)) {
        throw httpError("Only the repository owner can manage contributors", 403);
      }
      if (!config.suiPackageId) {
        throw httpError("SUI_PACKAGE_ID is required to build contributor transactions", 500);
      }

      const body = requestBodyRecord(request.body);
      const walletAddress = normalizedWalletAddress(body.walletAddress);
      if (walletAddress === state.ownerWallet.toLowerCase() || walletAddress === state.owner.toLowerCase()) {
        throw httpError("The owner already has full repository access", 400);
      }

      const tx = new Transaction();
      tx.setSender(auth.walletAddress);
      tx.moveCall({
        target: `${config.suiPackageId}::registry::${repoAccessFunctionName(accessAction(body.action), accessRole(body.role))}`,
        arguments: [tx.object(state.repoObjectId), tx.pure.address(walletAddress)]
      });

      await reply.header("cache-control", "no-store").send({
        chain: `sui:${config.suiNetwork}`,
        senderWallet: auth.walletAddress,
        transactionJson: await tx.toJSON()
      });
    }
  );

  app.post<{ Params: { owner: string; repo: string } }>(
    "/v1/repos/:owner/:repo/activity/access",
    async (request, reply) => {
      const state = await repos.sui.readState(request.params.owner, request.params.repo);
      if (!state) {
        throw httpError("Repository state not found", 404);
      }

      const auth = await ctx.requestAuthContext(request);
      if (!auth) {
        throw httpError("Sign in before recording contributor activity", 401);
      }
      if (!repos.sui.canManageAccess(state, auth)) {
        throw httpError("Only the repository owner can record contributor activity", 403);
      }

      const body = requestBodyRecord(request.body);
      await repos.activity.recordAccess({
        owner: state.owner,
        repo: state.repo,
        repoId: state.repoId,
        walletAddress: normalizedWalletAddress(body.walletAddress),
        role: accessRole(body.role),
        action: accessAction(body.action),
        actorWalletAddress: auth.walletAddress,
        txDigest: typeof body.txDigest === "string" && body.txDigest.trim() ? body.txDigest.trim() : undefined,
        createdAtMs: Date.now()
      });

      await reply.header("cache-control", "no-store").send({ ok: true });
    }
  );

  app.get<{ Params: { owner: string; repo: string } }>("/:owner/:repo/settings/access", async (request, reply) => {
    const state = await ctx.authorizedHtmlRepoState(request, reply);
    if (!state) {
      return;
    }

    const auth = await ctx.requestAuthContext(request);
    if (!auth) {
      throw httpError("Sign in before managing contributors", 401);
    }
    if (!repos.sui.canManageAccess(state, auth)) {
      throw httpError("Only the repository owner can manage contributors", 403);
    }

    await reply.type("text/html; charset=utf-8").send(
      renderRepoAccessPage({
        repo: await services.repoService.listItemWithCounts(state),
        viewer: webViewerFromRequest(request) ?? { walletAddress: auth.walletAddress }
      })
    );
  });

  app.get<{ Params: { owner: string; repo: string } }>("/:owner/:repo/activity", async (request, reply) => {
    const state = await ctx.authorizedHtmlRepoContentState(request, reply);
    if (!state) {
      return;
    }

    const activity = await repos.activity.list(state);
    await reply.type("text/html; charset=utf-8").send(
      renderRepoActivityPage({
        repo: await services.repoService.listItemWithCounts(state, { activity }),
        activity,
        viewer: webViewerFromRequest(request)
      })
    );
  });

  app.get("/", async (request, reply) => {
    const viewer = webViewerFromRequest(request);
    if (!viewer) {
      await reply
        .type("text/html; charset=utf-8")
        .send(renderLandingPage({ loginHref: ctx.webLoginUrl(request, "/") }));
      return;
    }

    const repoItems = await ctx.visibleRepoItems(request);
    await reply.type("text/html; charset=utf-8").send(renderDashboardPage(repoItems, viewer));
  });

  app.get("/new", async (request, reply) => {
    const viewer = webViewerFromRequest(request);
    await reply
      .type("text/html; charset=utf-8")
      .send(renderCreateRepoPage({ viewer, loginHref: ctx.webLoginUrl(request, "/new") }));
  });

  app.get("/v1/repos", async (request) => {
    return { repos: await ctx.visibleRepoItems(request) };
  });

  app.get<{ Params: { owner: string } }>("/:owner", async (request, reply) => {
    const repoItems = (await ctx.visibleRepoItems(request)).filter((repo) => repo.owner === request.params.owner);
    await reply
      .type("text/html; charset=utf-8")
      .send(renderProfilePage(request.params.owner, repoItems, webViewerFromRequest(request)));
  });

  app.get<{ Params: { owner: string; repo: string } }>("/v1/repos/:owner/:repo/index", async (request) => {
    const state = await ctx.authorizedRepoState(request, request.params.owner, request.params.repo);
    ctx.requireRepoContentAccess(request, state);
    return { index: await repos.index.ensure(state) };
  });

  app.post<{ Params: { owner: string; repo: string } }>("/v1/repos/:owner/:repo/index", async (request, reply) => {
    const state = await ctx.authorizedRepoState(request, request.params.owner, request.params.repo);
    ctx.requireRepoContentAccess(request, state);
    await reply.code(202).send({ index: await repos.index.reindex(state) });
  });

  app.get<{ Params: { owner: string; repo: string }; Querystring: { ref?: string; limit?: string } }>(
    "/v1/repos/:owner/:repo/commits",
    async (request) => {
      const state = await ctx.authorizedRepoState(request, request.params.owner, request.params.repo);
      ctx.requireRepoContentAccess(request, state);
      const ref = queryString(request.query.ref) ?? state.defaultBranch;
      const limit = Math.max(1, Math.min(queryInt(request.query.limit, 50), 500));
      const index = await repos.index.ensure(state);
      const repoPath = repos.git.path(state.owner, state.repo);
      return {
        repoId: state.repoId,
        ref,
        indexedAtMs: index.indexedAtMs,
        commits: await repos.index.commits(repoPath, ref, limit)
      };
    }
  );

  app.get<{ Params: { owner: string; repo: string }; Querystring: { ref?: string; path?: string } }>(
    "/v1/repos/:owner/:repo/tree",
    async (request) => {
      const state = await ctx.authorizedRepoState(request, request.params.owner, request.params.repo);
      ctx.requireRepoContentAccess(request, state);
      const ref = queryString(request.query.ref) ?? state.defaultBranch;
      const path = request.query.path ?? "";
      const index = await repos.index.ensure(state);
      const repoPath = repos.git.path(state.owner, state.repo);
      return {
        repoId: state.repoId,
        ref,
        path,
        indexedAtMs: index.indexedAtMs,
        entries: await repos.index.tree(repoPath, ref, path)
      };
    }
  );

  app.get<{ Params: { owner: string; repo: string }; Querystring: { ref?: string; path?: string } }>(
    "/v1/repos/:owner/:repo/blob",
    async (request) => {
      const state = await ctx.authorizedRepoState(request, request.params.owner, request.params.repo);
      ctx.requireRepoContentAccess(request, state);
      const ref = queryString(request.query.ref) ?? state.defaultBranch;
      const path = queryString(request.query.path);
      if (!path) {
        throw httpError("File path is required", 400);
      }
      const index = await repos.index.ensure(state);
      const repoPath = repos.git.path(state.owner, state.repo);
      return {
        repoId: state.repoId,
        ref,
        indexedAtMs: index.indexedAtMs,
        file: await repos.index.blob(repoPath, ref, path)
      };
    }
  );

  app.post("/v1/repos", async (request, reply) => {
    const auth = await ctx.requestAuthContext(request);
    if (!auth) {
      throw httpError("Sign in before creating a repository", 401);
    }

    const input = createRepoInput(request.body);
    const { owner, suiRepo } = await services.repoService.create(auth, input);

    if (isFormPost(request)) {
      await reply
        .code(303)
        .header("location", `/${encodeURIComponent(owner)}/${encodeURIComponent(input.name)}`)
        .send();
      return;
    }

    await reply.code(201).send({
      owner,
      name: input.name,
      visibility: input.visibility,
      gitRemotePath: `/${owner}/${input.name}.git`,
      registryMode: suiRepo.registryMode,
      repoObjectId: suiRepo.repoObjectId
    });
  });

  app.post<{ Params: { owner: string; repo: string } }>("/v1/repos/:owner/:repo/restore", async (request, reply) => {
    const state = await repos.sui.readState(request.params.owner, request.params.repo);
    let auth: AuthContext;
    try {
      auth = await parseDelegateAuth(config, request);
    } catch (error) {
      await reply.code(401).send({ error: error instanceof Error ? error.message : String(error) });
      return;
    }
    if (state && !repos.sui.canWrite(state, auth)) {
      await reply.code(403).send({ error: "Not authorized to restore this repository" });
      return;
    }

    const result = await services.restoreService.restore(request.params.owner, request.params.repo, auth);
    await reply.code(200).send(result);
  });

  app.get<{ Params: { owner: string; repo: string } }>("/v1/repos/:owner/:repo/manifests", async (request) => {
    const state = await repos.sui.readState(request.params.owner, request.params.repo);
    if (state?.visibility === "private") {
      const auth = await ctx.requestAuthContext(request);
      if (!repos.sui.canRead(state, auth)) {
        throw httpError("Not authorized to list manifests for this repository", auth ? 403 : 401);
      }
    }

    return { manifests: await repos.manifests.read(request.params.owner, request.params.repo) };
  });

  app.get<{ Params: { owner: string; repo: string }; Querystring: { ref?: string; path?: string } }>(
    "/:owner/:repo",
    async (request, reply) => {
      const state = await ctx.authorizedHtmlRepoContentState(request, reply);
      if (!state) {
        return;
      }
      const index = await repos.index.ensure(state);
      const ref = queryString(request.query.ref) ?? state.defaultBranch;
      const path = request.query.path ?? "";
      const repoPath = repos.git.path(state.owner, state.repo);
      const tree = await repos.index.tree(repoPath, ref, path);
      const commits = await repos.index.commits(repoPath, ref, 25);
      await reply.type("text/html; charset=utf-8").send(
        renderRepoPage({
          repo: await services.repoService.listItemWithCounts(state, { index }),
          index,
          commits,
          tree,
          readme: await readReadmePreview(repos, repoPath, path, ref, tree),
          ref,
          path,
          commitActors: await repos.commitActors.read(state, repoPath),
          origin: requestOrigin(request),
          viewer: webViewerFromRequest(request)
        })
      );
    }
  );

  app.get<{ Params: { owner: string; repo: string }; Querystring: { ref?: string; limit?: string } }>(
    "/:owner/:repo/commits",
    async (request, reply) => {
      const state = await ctx.authorizedHtmlRepoContentState(request, reply);
      if (!state) {
        return;
      }
      const index = await repos.index.ensure(state);
      const ref = queryString(request.query.ref) ?? state.defaultBranch;
      const limit = Math.max(1, Math.min(queryInt(request.query.limit, 100), 500));
      const repoPath = repos.git.path(state.owner, state.repo);
      const commits = await repos.index.commits(repoPath, ref, limit);
      await reply.type("text/html; charset=utf-8").send(
        renderCommitsPage({
          repo: await services.repoService.listItemWithCounts(state, { index }),
          index,
          commits,
          ref,
          commitActors: await repos.commitActors.read(state, repoPath),
          viewer: webViewerFromRequest(request)
        })
      );
    }
  );

  app.get<{ Params: { owner: string; repo: string }; Querystring: { ref?: string; path?: string } }>(
    "/:owner/:repo/tree",
    async (request, reply) => {
      const state = await ctx.authorizedHtmlRepoContentState(request, reply);
      if (!state) {
        return;
      }
      const index = await repos.index.ensure(state);
      const ref = queryString(request.query.ref) ?? state.defaultBranch;
      const path = request.query.path ?? "";
      const repoPath = repos.git.path(state.owner, state.repo);
      const tree = await repos.index.tree(repoPath, ref, path);
      const commits = await repos.index.commits(repoPath, ref, 25);
      await reply.type("text/html; charset=utf-8").send(
        renderRepoPage({
          repo: await services.repoService.listItemWithCounts(state, { index }),
          index,
          commits,
          tree,
          readme: await readReadmePreview(repos, repoPath, path, ref, tree),
          ref,
          path,
          commitActors: await repos.commitActors.read(state, repoPath),
          origin: requestOrigin(request),
          viewer: webViewerFromRequest(request)
        })
      );
    }
  );

  app.get<{ Params: { owner: string; repo: string }; Querystring: { ref?: string; path?: string } }>(
    "/:owner/:repo/blob",
    async (request, reply) => {
      const state = await ctx.authorizedHtmlRepoContentState(request, reply);
      if (!state) {
        return;
      }
      const index = await repos.index.ensure(state);
      const ref = queryString(request.query.ref) ?? state.defaultBranch;
      const path = queryString(request.query.path);
      if (!path) {
        throw httpError("File path is required", 400);
      }
      const repoPath = repos.git.path(state.owner, state.repo);
      await reply.type("text/html; charset=utf-8").send(
        renderBlobPage({
          repo: await services.repoService.listItemWithCounts(state, { index }),
          index,
          commits: await repos.index.commits(repoPath, ref, 25),
          ref,
          file: await repos.index.blob(repoPath, ref, path),
          viewer: webViewerFromRequest(request)
        })
      );
    }
  );
};
