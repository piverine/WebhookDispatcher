import { FastifyPluginAsync } from "fastify";
import { listDlqJobs, replayAllDlq, replayDlqJob } from "../queue/jobs.repo.js";
import { metrics } from "../lib/metrics.js";
import { eventBus } from "../lib/events.js";

export const dlqRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/webhooks/dlq
  fastify.get<{
    Querystring: { limit?: string; offset?: string; search?: string };
  }>("/api/webhooks/dlq", async (req, reply) => {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const search = req.query.search;

    const result = await listDlqJobs({ limit, offset, search });

    return reply.status(200).send({
      total: result.total,
      limit,
      offset,
      jobs: result.jobs.map((j) => ({
        jobId: j.id,
        eventId: j.event_id,
        destinationUrl: j.destination_url,
        destinationHost: j.destination_host,
        status: j.status,
        attemptCount: j.attempt_count,
        maxAttempts: j.max_attempts,
        lastError: j.last_error,
        createdAt: j.created_at.toISOString(),
        updatedAt: j.updated_at.toISOString(),
      })),
    });
  });

  // POST /api/webhooks/dlq/:jobId/replay
  fastify.post<{ Params: { jobId: string } }>(
    "/api/webhooks/dlq/:jobId/replay",
    async (req, reply) => {
      const { jobId } = req.params;

      const job = await replayDlqJob(jobId);
      if (!job) {
        return reply.status(404).send({
          error: "dlq_job_not_found",
          message: "Job not found or not in failed status",
        });
      }

      metrics.incDlqRedrive(1);
      eventBus.emit("job:redriven", { jobId: job.id });

      return reply.status(200).send({
        status: "queued",
        jobId: job.id,
        message: "Job successfully redriven into delivery queue",
      });
    }
  );

  // POST /api/webhooks/dlq/replay-all
  fastify.post<{ Querystring: { limit?: string } }>(
    "/api/webhooks/dlq/replay-all",
    async (req, reply) => {
      const limit = req.query.limit ? Number(req.query.limit) : 100;
      const count = await replayAllDlq(limit);

      if (count > 0) {
        metrics.incDlqRedrive(count);
        eventBus.emit("job:redriven", { count });
      }

      return reply.status(200).send({
        status: "replayed",
        redrivenCount: count,
        message: `Successfully redriven ${count} failed jobs into the delivery queue`,
      });
    }
  );
};

