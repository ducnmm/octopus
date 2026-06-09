import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import type { FastifyInstance } from "fastify";
import { httpError } from "../lib/http-error.js";
import type { RouteDeps } from "./index.js";

export const enokiRoutes = async (app: FastifyInstance, deps: RouteDeps) => {
  const { config, services } = deps;

  app.post("/v1/enoki/sponsored-transactions", async (request, reply) => {
    const sponsored = await services.enokiService.createSponsored(request.body);
    await reply.send(sponsored);
  });

  app.post<{ Params: { digest: string } }>(
    "/v1/enoki/sponsored-transactions/:digest/execute",
    async (request, reply) => {
      const executed = await services.enokiService.executeSponsored(request.params.digest, request.body);
      await reply.send(executed);
    }
  );

  app.get<{ Params: { digest: string } }>("/v1/sui/transactions/:digest/wait", async (request, reply) => {
    const digest = request.params.digest.trim();
    if (!digest) {
      throw httpError("Missing transaction digest", 400);
    }

    const client = new SuiJsonRpcClient({ url: config.suiRpcUrl, network: config.suiNetwork as "testnet" });
    const transaction = await client.waitForTransaction({ digest });
    await reply.header("cache-control", "no-store").send({ ok: true, digest, transaction });
  });
};
