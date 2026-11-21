import { FastifyPluginAsync } from "fastify";
import { getJobWithAttempts, listJobs } from "../queue/jobs.repo.js";

export const jobsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/webhooks/jobs/:jobId
  fastify.get<{ Params: { jobId: string } }>("/api/webhooks/jobs/:jobId", async (req, reply) => {
    const { jobId } = req.params;

    // UUID format check
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId);
    if (!isUuid) {
      return reply.status(404).send({ error: "job_not_found" });
    }

    const result = await getJobWithAttempts(jobId);
    if (!result) {
      return reply.status(404).send({ error: "job_not_found" });
    }

    const { job, attempts } = result;

    return reply.status(200).send({
      jobId: job.id,
      eventId: job.event_id,
      destinationUrl: job.destination_url,
      status: job.status,
      attemptCount: job.attempt_count,
      nextAttemptAt: job.next_attempt_at.toISOString(),
      attempts: attempts.map((a) => ({
        attempt: a.attempt,
        status: a.status,
        responseCode: a.response_code,
        durationMs: a.duration_ms,
        error: a.error,
        at: a.created_at.toISOString(),
      })),
    });
  });

  // GET /api/webhooks/jobs (optional query: ?status= &limit=)
  fastify.get<{ Querystring: { status?: string; limit?: string } }>("/api/webhooks/jobs", async (req, reply) => {
    const { status, limit } = req.query;
    const jobs = await listJobs({
      status,
      limit: limit ? Number(limit) : undefined,
    });

    return reply.status(200).send({
      jobs: jobs.map((j) => ({
        jobId: j.id,
        eventId: j.event_id,
        destinationUrl: j.destination_url,
        status: j.status,
        attemptCount: j.attempt_count,
        nextAttemptAt: j.next_attempt_at.toISOString(),
        createdAt: j.created_at.toISOString(),
      })),
    });
  });
};

