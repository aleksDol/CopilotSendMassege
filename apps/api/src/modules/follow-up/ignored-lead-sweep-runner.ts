import type { FastifyInstance } from "fastify";
import { markContactedLeadsIgnored } from "./ignored-lead-sweep.js";

export function startIgnoredLeadSweep(app: FastifyInstance) {
  if (app.config.env.NODE_ENV === "test") {
    return;
  }

  if (!app.config.env.CRM_IGNORED_SWEEP_ENABLED) {
    app.log.info("ignored_sweep_disabled");
    return;
  }

  const intervalMs = app.config.env.CRM_IGNORED_SWEEP_INTERVAL_MINUTES * 60 * 1000;

  app.log.info(
    {
      intervalMinutes: app.config.env.CRM_IGNORED_SWEEP_INTERVAL_MINUTES,
      ignoredAfterHours: app.config.env.CRM_IGNORED_AFTER_HOURS
    },
    "ignored_sweep_runner_started"
  );

  const runOnce = async () => {
    try {
      await markContactedLeadsIgnored(app.prisma, {
        unansweredHours: app.config.env.CRM_IGNORED_AFTER_HOURS,
        logger: app.log
      });
    } catch (err: unknown) {
      app.log.warn({ err }, "ignored_sweep_failed");
    }
  };

  // Kick once shortly after startup, then on interval.
  setTimeout(() => void runOnce(), 5_000);
  setInterval(() => void runOnce(), intervalMs);
}

