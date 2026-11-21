import { FastifyPluginAsync } from "fastify";
import { checkDbHealth } from "../db.js";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/health", async (_req, reply) => {
    const isDbHealthy = await checkDbHealth();
    if (!isDbHealthy) {
      return reply.status(503).send({ ok: false, error: "database_unavailable" });
    }
    return reply.status(200).send({ ok: true });
  });
};

