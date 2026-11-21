import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { validateDestinationUrl } from "../lib/urlGuard.js";
import { enqueue } from "../queue/jobs.repo.js";
import { metrics } from "../lib/metrics.js";
import { eventBus } from "../lib/events.js";

const dispatchSchema = z.object({
  destinationUrl: z.string().url("Must be a valid URL"),
  eventId: z.string().min(1, "eventId is required").max(128, "eventId max length 128"),
  payload: z.record(z.unknown()),
});

export const dispatchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/api/webhooks/dispatch",
    {
      config: {
        rateLimit: {
          max: config.ingestRateLimitPerMin,
          timeWindow: "1 minute",
        },
      },
    },
    async (req, reply) => {
      // 1. Zod schema validation
      const parsed = dispatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "validation_failed",
          details: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
      }

      const { destinationUrl, eventId, payload } = parsed.data;

      // 2. SSRF URL validation
      const urlValidation = validateDestinationUrl(destinationUrl);
      if (!urlValidation.valid || !urlValidation.url) {
        return reply.status(400).send({
          error: "validation_failed",
          details: [
            {
              path: "destinationUrl",
              message: `Invalid destination URL: ${urlValidation.reason || "forbidden target"}`,
            },
          ],
        });
      }

      const destinationHost = urlValidation.url.hostname.toLowerCase();

      // 3. Enqueue job (Idempotent: returns existing job if duplicate eventId)
      // NOTE: Hard rule 1 - this route does NOT make outbound HTTP calls.
      const { job, duplicate } = await enqueue({
        eventId,
        destinationUrl,
        destinationHost,
        payload,
      });

      metrics.incEnqueued(1, false);
      eventBus.emit("job:enqueued", {
        jobId: job.id,
        eventId: job.event_id,
        destinationUrl: job.destination_url,
      });

      if (duplicate) {
        return reply.status(202).send({
          status: "queued",
          jobId: job.id,
          duplicate: true,
        });
      }

      return reply.status(202).send({
        status: "queued",
        jobId: job.id,
      });
    }
  );
};
