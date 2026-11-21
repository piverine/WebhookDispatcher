import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { validateDestinationUrl } from "../lib/urlGuard.js";
import { enqueueBatch } from "../queue/jobs.repo.js";
import { metrics } from "../lib/metrics.js";
import { eventBus } from "../lib/events.js";

const batchItemSchema = z.object({
  destinationUrl: z.string().url("Must be a valid URL"),
  eventId: z.string().min(1, "eventId is required").max(128, "eventId max length 128"),
  payload: z.record(z.unknown()),
});

const batchDispatchSchema = z.object({
  jobs: z.array(batchItemSchema).min(1, "Batch must contain at least 1 job").max(100, "Maximum 100 jobs per batch"),
});

export const batchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/api/webhooks/dispatch/batch",
    {
      config: {
        rateLimit: {
          max: config.ingestRateLimitPerMin,
          timeWindow: "1 minute",
        },
      },
    },
    async (req, reply) => {
      const parsed = batchDispatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "validation_failed",
          details: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
      }

      const { jobs } = parsed.data;

      // Validate all URLs for SSRF
      const validatedJobs: Array<{
        eventId: string;
        destinationUrl: string;
        destinationHost: string;
        payload: Record<string, unknown>;
      }> = [];

      for (let i = 0; i < jobs.length; i++) {
        const item = jobs[i];
        const urlValidation = validateDestinationUrl(item.destinationUrl);
        if (!urlValidation.valid || !urlValidation.url) {
          return reply.status(400).send({
            error: "validation_failed",
            details: [
              {
                path: `jobs.${i}.destinationUrl`,
                message: `Invalid destination URL: ${urlValidation.reason || "forbidden target"}`,
              },
            ],
          });
        }
        validatedJobs.push({
          eventId: item.eventId,
          destinationUrl: item.destinationUrl,
          destinationHost: urlValidation.url.hostname.toLowerCase(),
          payload: item.payload,
        });
      }

      // Enqueue batch atomically in PostgreSQL
      const result = await enqueueBatch(validatedJobs);

      metrics.incEnqueued(result.accepted, true);
      eventBus.emit("job:enqueued", {
        jobId: result.jobs[0]?.jobId || "",
        eventId: result.jobs[0]?.eventId || "",
        destinationUrl: validatedJobs[0]?.destinationUrl || "",
        batch: true,
      });

      return reply.status(202).send({
        status: "queued",
        total: result.total,
        accepted: result.accepted,
        duplicates: result.duplicates,
        jobs: result.jobs,
      });
    }
  );
};

