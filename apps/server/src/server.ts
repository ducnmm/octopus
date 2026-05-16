import { mkdir } from "node:fs/promises";
import Fastify from "fastify";
import { createRepoRequestSchema } from "@octopus/shared";
import { readRepoManifests } from "./artifacts.js";
import type { ServerConfig } from "./config.js";
import { handleGitHttp, initBareRepository } from "./git.js";
import { restoreRepository } from "./restore.js";
import { ensureSuiRepo, listSuiRepoStates } from "./sui.js";
import { renderRepoListPage, toRepoListItem } from "./web.js";

export const buildServer = (config: ServerConfig) => {
  const app = Fastify({
    logger: true,
    bodyLimit: 1024 * 1024 * 200
  });

  app.addContentTypeParser(
    /^application\/x-git-.*/,
    { parseAs: "buffer" },
    (_request, body, done) => {
      done(null, body);
    }
  );

  app.get("/healthz", async () => ({
    ok: true,
    service: "octopus-server"
  }));

  app.get("/", async (_request, reply) => {
    const repos = (await listSuiRepoStates(config)).map(toRepoListItem);
    await reply.type("text/html; charset=utf-8").send(renderRepoListPage(repos));
  });

  app.get("/v1/repos", async () => {
    return {
      repos: (await listSuiRepoStates(config)).map(toRepoListItem)
    };
  });

  app.post("/v1/repos", async (request, reply) => {
    const input = createRepoRequestSchema.parse(request.body);
    await mkdir(config.repoRoot, { recursive: true });
    await initBareRepository(config.repoRoot, input.owner, input.name);
    const suiRepo = await ensureSuiRepo(config, {
      owner: input.owner,
      repo: input.name,
      visibility: input.visibility
    });

    await reply.code(201).send({
      owner: input.owner,
      name: input.name,
      visibility: input.visibility,
      gitRemotePath: `/${input.owner}/${input.name}.git`,
      registryMode: suiRepo.registryMode,
      repoObjectId: suiRepo.repoObjectId
    });
  });

  app.post<{
    Params: {
      owner: string;
      repo: string;
    };
  }>("/v1/repos/:owner/:repo/restore", async (request, reply) => {
    const result = await restoreRepository(config, request.params.owner, request.params.repo);
    await reply.code(200).send(result);
  });

  app.get<{
    Params: {
      owner: string;
      repo: string;
    };
  }>("/v1/repos/:owner/:repo/manifests", async (request) => {
    return {
      manifests: await readRepoManifests(config.dataDir, request.params.owner, request.params.repo)
    };
  });

  app.all("/*", async (request, reply) => {
    if (request.url.includes(".git")) {
      await handleGitHttp(request, reply, config);
      return;
    }

    await reply.code(404).send({ error: "Not found" });
  });

  return app;
};
