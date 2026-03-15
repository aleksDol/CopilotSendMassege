import type { FastifyPluginAsync } from "fastify";
import { getCompanyScope } from "../../lib/request-context.js";
import { parseWithSchema } from "../../lib/validation.js";
import { BillingService } from "./service.js";
import { checkoutSessionBodySchema } from "./schemas.js";

const billingRoutes: FastifyPluginAsync = async (app) => {
  const service = new BillingService(app);

  app.get("/billing/subscription", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    return service.getSubscription(scope.companyId);
  });

  app.get("/billing/usage", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    return service.getUsage(scope.companyId);
  });

  app.post("/billing/checkout-session", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(checkoutSessionBodySchema, request.body);

    return service.createCheckoutSession({
      companyId: scope.companyId,
      plan: body.plan
    });
  });

  app.post("/billing/portal", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    return service.createPortal(scope.companyId);
  });

  app.post(
    "/webhooks/stripe",
    {
      config: {
        rawBody: true
      }
    },
    async (request) => {
      const signature = typeof request.headers["stripe-signature"] === "string" ? request.headers["stripe-signature"] : undefined;
      const rawBody = Buffer.isBuffer(request.rawBody)
        ? request.rawBody
        : typeof request.rawBody === "string"
          ? Buffer.from(request.rawBody)
          : undefined;

      return service.processStripeWebhook({
        signature,
        rawBody
      });
    }
  );
};

export default billingRoutes;
