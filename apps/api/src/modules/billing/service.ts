import { Plan, SubscriptionStatus, UsageMetricType } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";
import { resolvePlanConfig } from "../../lib/billing/plans.js";
import { currentUsagePeriod, ensureSubscription, getLatestSubscription, resolveSubscriptionState } from "../../lib/billing/subscriptions.js";
import { StripeService } from "../../lib/billing/stripe.js";

const toLower = (value: string) => value.toLowerCase();

const mapPlan = (plan: "free" | "pro" | "team"): Plan => {
  if (plan === "pro") return Plan.PRO;
  if (plan === "team") return Plan.TEAM;
  return Plan.FREE;
};

const mapStripeStatus = (status: string | undefined): SubscriptionStatus => {
  if (status === "active") return SubscriptionStatus.ACTIVE;
  if (status === "past_due") return SubscriptionStatus.PAST_DUE;
  if (status === "incomplete") return SubscriptionStatus.INCOMPLETE;
  if (status === "trialing") return SubscriptionStatus.TRIALING;
  return SubscriptionStatus.CANCELED;
};

const resolvePlanFromPriceId = (priceId: string | undefined, env: FastifyInstance["config"]["env"]): Plan | null => {
  if (!priceId) return null;
  if (env.STRIPE_PRICE_TEAM && priceId === env.STRIPE_PRICE_TEAM) return Plan.TEAM;
  if (env.STRIPE_PRICE_PRO && priceId === env.STRIPE_PRICE_PRO) return Plan.PRO;
  return null;
};

export class BillingService {
  constructor(private readonly app: FastifyInstance) {}

  private getStripe() {
    const secret = this.app.config.env.STRIPE_SECRET_KEY;
    if (!secret) {
      throw new AppError(503, "BILLING_UNAVAILABLE", "Stripe is not configured");
    }
    return new StripeService(secret);
  }

  async createCustomerForCompany(params: {
    companyId: string;
    email: string;
    companyName: string;
    initializeTrial?: boolean;
  }) {
    if (!this.app.config.env.STRIPE_SECRET_KEY) {
      await ensureSubscription(this.app, {
        companyId: params.companyId,
        plan: Plan.FREE,
        initializeTrial: params.initializeTrial
      });
      return null;
    }

    const stripe = this.getStripe();
    const customer = await stripe.createCustomer({
      email: params.email,
      name: params.companyName,
      metadata: {
        companyId: params.companyId
      }
    });

    const sub = await ensureSubscription(this.app, {
      companyId: params.companyId,
      plan: Plan.FREE,
      stripeCustomerId: customer.id,
      initializeTrial: params.initializeTrial
    });

    if (!sub.stripeCustomerId) {
      await this.app.prisma.subscription.update({
        where: { id: sub.id },
        data: { stripeCustomerId: customer.id }
      });
    }

    return customer.id;
  }

  async getSubscription(companyId: string) {
    const company = await this.app.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new AppError(404, "COMPANY_NOT_FOUND", "Company not found");
    }

    const subscription = await ensureSubscription(this.app, { companyId, plan: company.plan });
    const access = resolveSubscriptionState({
      subscription,
      companyPlan: company.plan
    });
    const planConfig = resolvePlanConfig(access.limitsPlan);

    return {
      id: subscription.id,
      plan: toLower(access.limitsPlan),
      status: access.subscriptionStatus,
      subscriptionStatus: access.subscriptionStatus,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      trialStartedAt: access.trialStartedAt,
      trialEndsAt: access.trialEndsAt,
      isTrialActive: access.isTrialActive,
      isTrialExpired: access.isTrialExpired,
      trialTimeLeftMs: access.timeLeftMs,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      limits: {
        aiSuggestionsPerMonth: planConfig.aiSuggestionsPerMonth,
        maxUsers: planConfig.maxUsers
      }
    };
  }

  async getUsage(companyId: string) {
    const company = await this.app.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new AppError(404, "COMPANY_NOT_FOUND", "Company not found");
    }

    const subscription = await ensureSubscription(this.app, { companyId, plan: company.plan });
    const access = resolveSubscriptionState({
      subscription,
      companyPlan: company.plan
    });
    const { start, end } = currentUsagePeriod(subscription);
    const planConfig = resolvePlanConfig(access.limitsPlan);

    const usage = await this.app.prisma.usageRecord.aggregate({
      where: {
        companyId,
        metricType: UsageMetricType.AI_SUGGESTION,
        periodStart: start,
        periodEnd: end
      },
      _sum: {
        quantity: true
      }
    });

    const aiUsage = usage._sum.quantity ?? 0;

    return {
      plan: toLower(access.limitsPlan),
      subscriptionStatus: access.subscriptionStatus,
      trialEndsAt: access.trialEndsAt,
      trialTimeLeftMs: access.timeLeftMs,
      aiUsage,
      aiLimit: planConfig.aiSuggestionsPerMonth,
      periodStart: start,
      periodEnd: end
    };
  }

  async createCheckoutSession(params: { companyId: string; plan: "pro" | "team" }) {
    const company = await this.app.prisma.company.findUnique({ where: { id: params.companyId } });
    if (!company) {
      throw new AppError(404, "COMPANY_NOT_FOUND", "Company not found");
    }

    const subscription = await ensureSubscription(this.app, { companyId: params.companyId, plan: company.plan });
    const customerId = subscription.stripeCustomerId;

    if (!customerId) {
      throw new AppError(400, "BILLING_CUSTOMER_MISSING", "Stripe customer is missing");
    }

    const stripe = this.getStripe();
    const plan = mapPlan(params.plan);
    const priceId = plan === Plan.PRO ? this.app.config.env.STRIPE_PRICE_PRO : this.app.config.env.STRIPE_PRICE_TEAM;

    if (!priceId) {
      throw new AppError(503, "BILLING_UNAVAILABLE", "Stripe price id is not configured");
    }

    const session = await stripe.createCheckoutSession({
      customerId,
      priceId,
      successUrl: `${this.app.config.env.APP_BASE_URL}/settings/billing?checkout=success`,
      cancelUrl: `${this.app.config.env.APP_BASE_URL}/settings/billing?checkout=cancel`,
      companyId: params.companyId,
      plan: plan.toString()
    });

    if (!session.url) {
      throw new AppError(500, "CHECKOUT_CREATION_FAILED", "Failed to create checkout session");
    }

    return { url: session.url };
  }

  async createPortal(companyId: string) {
    const subscription = await getLatestSubscription(this.app, companyId);
    if (!subscription?.stripeCustomerId) {
      throw new AppError(400, "BILLING_CUSTOMER_MISSING", "Stripe customer is missing");
    }

    const stripe = this.getStripe();
    const session = await stripe.createBillingPortalSession({
      customerId: subscription.stripeCustomerId,
      returnUrl: `${this.app.config.env.APP_BASE_URL}/settings/billing`
    });

    return { url: session.url };
  }

  async recordUsage(companyId: string, metricType: UsageMetricType, quantity: number, periodStart: Date, periodEnd: Date) {
    await this.app.prisma.usageRecord.create({
      data: {
        companyId,
        metricType,
        quantity,
        periodStart,
        periodEnd
      }
    });
  }

  async enforceAiLimit(companyId: string) {
    const usage = await this.getUsage(companyId);
    if (usage.subscriptionStatus === "trial") {
      return usage;
    }
    if (usage.aiUsage >= usage.aiLimit) {
      throw new AppError(402, "AI_LIMIT_REACHED", "ai_limit_reached");
    }
    return usage;
  }

  async processStripeWebhook(params: { signature: string | undefined; rawBody: Buffer | undefined }) {
    if (!params.signature || !params.rawBody) {
      throw new AppError(400, "INVALID_WEBHOOK", "Missing webhook signature or payload");
    }

    const secret = this.app.config.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new AppError(503, "BILLING_UNAVAILABLE", "Stripe webhook secret is not configured");
    }

    const stripe = this.getStripe();
    const event = stripe.constructWebhookEvent(params.rawBody, params.signature, secret);

    if (event.type === "checkout.session.completed") {
      const data = event.data.object as {
        customer?: string;
        subscription?: string;
        metadata?: { companyId?: string; plan?: string };
      };
      const companyId = data.metadata?.companyId;
      const plan = (data.metadata?.plan as Plan | undefined) ?? Plan.PRO;

      if (companyId) {
        const now = new Date();
        const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
        const orConditions: Array<{ stripeSubscriptionId?: string; companyId?: string; stripeCustomerId?: string }> = [];
        if (data.subscription) {
          orConditions.push({ stripeSubscriptionId: String(data.subscription) });
        }
        if (data.customer) {
          orConditions.push({ companyId, stripeCustomerId: String(data.customer) });
        }

        const existing =
          orConditions.length > 0
            ? await this.app.prisma.subscription.findFirst({
                where: { OR: orConditions },
                orderBy: { createdAt: "desc" }
              })
            : null;

        if (existing) {
          await this.app.prisma.subscription.update({
            where: { id: existing.id },
            data: {
              plan,
              status: SubscriptionStatus.ACTIVE,
              stripeCustomerId: data.customer ? String(data.customer) : existing.stripeCustomerId,
              stripeSubscriptionId: data.subscription ? String(data.subscription) : existing.stripeSubscriptionId,
              currentPeriodStart: now,
              currentPeriodEnd: end
            }
          });
        } else {
          await this.app.prisma.subscription.create({
            data: {
              companyId,
              plan,
              status: SubscriptionStatus.ACTIVE,
              stripeCustomerId: data.customer ? String(data.customer) : null,
              stripeSubscriptionId: data.subscription ? String(data.subscription) : null,
              currentPeriodStart: now,
              currentPeriodEnd: end
            }
          });
        }

        await this.app.prisma.company.update({
          where: { id: companyId },
          data: { plan }
        });
      }
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const subscriptionData = event.data.object as {
        id: string;
        customer: string;
        status: string;
        cancel_at_period_end?: boolean;
        current_period_start?: number;
        current_period_end?: number;
        items?: { data?: Array<{ price?: { id?: string } }> };
      };

      const existing = await this.app.prisma.subscription.findFirst({
        where: {
          OR: [
            { stripeSubscriptionId: subscriptionData.id },
            { stripeCustomerId: String(subscriptionData.customer) }
          ]
        },
        orderBy: { createdAt: "desc" }
      });

      if (existing) {
        const nextStatus = mapStripeStatus(subscriptionData.status);
        const priceId = subscriptionData.items?.data?.[0]?.price?.id;
        const inferredPlan = resolvePlanFromPriceId(priceId, this.app.config.env);

        await this.app.prisma.subscription.update({
          where: { id: existing.id },
          data: {
            plan: inferredPlan ?? existing.plan,
            status: nextStatus,
            stripeSubscriptionId: subscriptionData.id,
            cancelAtPeriodEnd: Boolean(subscriptionData.cancel_at_period_end),
            currentPeriodStart: subscriptionData.current_period_start
              ? new Date(subscriptionData.current_period_start * 1000)
              : existing.currentPeriodStart,
            currentPeriodEnd: subscriptionData.current_period_end
              ? new Date(subscriptionData.current_period_end * 1000)
              : existing.currentPeriodEnd
          }
        });

        if (inferredPlan) {
          await this.app.prisma.company.update({
            where: { id: existing.companyId },
            data: { plan: inferredPlan }
          });
        }
      }
    }

    return { received: true };
  }
}
