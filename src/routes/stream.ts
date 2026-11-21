import { FastifyPluginAsync } from "fastify";
import { eventBus, WebhookEventType } from "../lib/events.js";

export const streamRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/webhooks/stream", async (req, reply) => {
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("Access-Control-Allow-Origin", "*");
    reply.raw.flushHeaders();

    // Initial connection event
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`);

    const events: WebhookEventType[] = [
      "job:enqueued",
      "job:attempt",
      "job:succeeded",
      "job:retrying",
      "job:failed",
      "job:redriven",
      "circuit:tripped",
    ];

    const listeners: Array<{ event: WebhookEventType; fn: (data: unknown) => void }> = [];

    for (const ev of events) {
      const listener = (data: unknown) => {
        try {
          reply.raw.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch {}
      };
      eventBus.on(ev, listener);
      listeners.push({ event: ev, fn: listener });
    }

    // Keepalive ping every 15s to prevent cloud proxies (Render, Cloudflare) from closing idle SSE
    const pingTimer = setInterval(() => {
      try {
        reply.raw.write(`: ping ${Date.now()}\n\n`);
      } catch {}
    }, 15000);

    req.raw.on("close", () => {
      clearInterval(pingTimer);
      for (const { event, fn } of listeners) {
        eventBus.off(event, fn as any);
      }
    });

    // Keep response hanging for SSE
    await new Promise(() => {});
  });
};

