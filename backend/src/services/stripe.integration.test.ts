import "dotenv/config";
import { describe, it, expect, afterAll } from "vitest";
import { stripe, createCheckoutSession } from "./stripe.js";

// Hits real Stripe test API — requires STRIPE_SECRET_KEY and STRIPE_PRICE_ID in .env
// Excluded from CI via test:ci script

describe("Stripe integration", () => {
  let customerId: string;

  afterAll(async () => {
    if (customerId) {
      await stripe.customers.del(customerId);
    }
  });

  it("creates a Stripe customer via the SDK", async () => {
    const customer = await stripe.customers.create({
      email: "stripe-integration-test@example.com",
      metadata: { test: "true" },
    });
    customerId = customer.id;

    expect(customerId).toMatch(/^cus_/);
    expect(customer.email).toBe("stripe-integration-test@example.com");
  }, 15000);

  it.skipIf(!process.env.STRIPE_PRICE_ID)(
    "createCheckoutSession returns a Stripe Checkout URL",
    async () => {
      const url = await createCheckoutSession(customerId, "test-user-id");
      expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    },
    15000,
  );

  it("webhook constructEvent succeeds with a real HMAC signature", () => {
    const payload = JSON.stringify({
      id: "evt_test_123",
      type: "checkout.session.completed",
      data: { object: { metadata: { userId: "test-user" } } },
    });
    const secret = "whsec_test_" + "a".repeat(32);
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });

    const event = stripe.webhooks.constructEvent(payload, header, secret);

    expect(event.type).toBe("checkout.session.completed");
  });

  it("webhook constructEvent throws on a tampered payload", () => {
    const payload = JSON.stringify({ type: "checkout.session.completed" });
    const secret = "whsec_test_" + "a".repeat(32);
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });

    expect(() =>
      stripe.webhooks.constructEvent(payload + "tampered", header, secret),
    ).toThrow();
  });
});
