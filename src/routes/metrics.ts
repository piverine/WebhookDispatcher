import { FastifyPluginAsync } from "fastify";
import { metrics } from "../lib/metrics.js";

export const metricsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/metrics", async (_req, reply) => {
    const text = await metrics.getPrometheusText();
    return reply
      .header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
      .status(200)
      .send(text);
  });
};

