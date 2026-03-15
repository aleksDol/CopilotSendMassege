import Stripe from "stripe";

export class StripeService {
  private readonly stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey, {
      apiVersion: "2024-06-20"
    });
  }

  createCustomer(params: { email: string; name: string; metadata?: Record<string, string> }) {
    return this.stripe.customers.create({
      email: params.email,
      name: params.name,
      metadata: params.metadata
    });
  }

  createCheckoutSession(params: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    companyId: string;
    plan: string;
  }) {
    return this.stripe.checkout.sessions.create({
      mode: "subscription",
      customer: params.customerId,
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        companyId: params.companyId,
        plan: params.plan
      }
    });
  }

  createBillingPortalSession(params: { customerId: string; returnUrl: string }) {
    return this.stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl
    });
  }

  constructWebhookEvent(rawBody: Buffer | string, signature: string, webhookSecret: string) {
    return this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  }
}
