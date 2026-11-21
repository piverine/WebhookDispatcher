import { FastifyPluginAsync } from "fastify";

interface MockHitStats {
  totalHits: number;
  hitsPerEventId: Record<string, number>;
}

const stats: MockHitStats = {
  totalHits: 0,
  hitsPerEventId: {},
};

export const mockRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /mock/receiver
  fastify.post<{
    Querystring: {
      mode?: "ok" | "fail" | "rate" | "slow" | "flaky";
      delay?: string;
      failFirst?: string;
    };
  }>("/mock/receiver", async (req, reply) => {
    const mode = req.query.mode || "ok";
    const eventIdHeader = req.headers["x-webhook-event-id"];
    const eventId =
      typeof eventIdHeader === "string"
        ? eventIdHeader
        : (req.body as { eventId?: string })?.eventId || "unknown";

    stats.totalHits++;
    stats.hitsPerEventId[eventId] = (stats.hitsPerEventId[eventId] || 0) + 1;
    const hitCount = stats.hitsPerEventId[eventId];

    switch (mode) {
      case "fail":
        return reply.status(500).send({ error: "mock_failure" });

      case "rate":
        return reply
          .status(429)
          .header("Retry-After", "3")
          .send({ error: "rate_limited" });

      case "slow": {
        const delayMs = Number(req.query.delay) || 10000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return reply.status(200).send({ received: true, delayMs });
      }

      case "flaky": {
        const failFirst = Number(req.query.failFirst) || 2;
        if (hitCount <= failFirst) {
          return reply
            .status(500)
            .send({ error: "mock_flaky_failure", hitCount, failFirst });
        }
        return reply
          .status(200)
          .send({ received: true, hitCount, recovered: true });
      }

      case "ok":
      default:
        return reply.status(200).send({ received: true });
    }
  });

  // GET /mock/receiver/stats
  fastify.get("/mock/receiver/stats", async (_req, reply) => {
    return reply.status(200).send(stats);
  });

  // POST /mock/receiver/reset (utility for clean testing)
  fastify.post("/mock/receiver/reset", async (_req, reply) => {
    stats.totalHits = 0;
    stats.hitsPerEventId = {};
    return reply.status(200).send({ reset: true });
  });
};
