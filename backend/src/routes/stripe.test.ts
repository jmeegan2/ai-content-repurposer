import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const {
  mockGetOrCreateCustomer,
  mockCreateCheckoutSession,
  mockCreatePortalSession,
  mockConstructEvent,
  mockUpsert,
  mockUpdate,
} = vi.hoisted(() => ({
  mockGetOrCreateCustomer: vi.fn(),
  mockCreateCheckoutSession: vi.fn(),
  mockCreatePortalSession: vi.fn(),
  mockConstructEvent: vi.fn(),
  mockUpsert: vi.fn().mockResolvedValue({ error: null }),
  mockUpdate: vi.fn().mockReturnValue({ eq: () => Promise.resolve({ error: null }) }),
}));

let profileRow: Record<string, unknown> | null = null;

vi.mock("../services/stripe.js", () => ({
  stripe: { webhooks: { constructEvent: mockConstructEvent } },
  getOrCreateCustomer: mockGetOrCreateCustomer,
  createCheckoutSession: mockCreateCheckoutSession,
  createPortalSession: mockCreatePortalSession,
}));

vi.mock("../services/supabase.js", () => ({
  supabase: {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              table === "profiles" && profileRow
                ? Promise.resolve({ data: profileRow, error: null })
                : Promise.resolve({ data: null, error: { message: "not found" } }),
          }),
        }),
        upsert: mockUpsert,
        update: mockUpdate,
      };
    },
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user" } }, error: null }),
    },
  },
}));

import stripeRouter, { webhookRouter } from "./stripe.js";

const app = express();

// Webhook needs raw body — register before express.json()
app.use("/stripe", webhookRouter);

app.use(express.json());

// Stub auth: set userId without token validation (mirrors jobs.test.ts pattern)
app.use("/stripe", (req: express.Request & { userId?: string }, _res, next) => {
  req.userId = "test-user";
  next();
}, stripeRouter);

beforeEach(() => {
  vi.clearAllMocks();
  profileRow = null;
  mockUpsert.mockResolvedValue({ error: null });
  mockUpdate.mockReturnValue({ eq: () => Promise.resolve({ error: null }) });
});

// ---------------------------------------------------------------------------
// POST /stripe/create-checkout-session
// ---------------------------------------------------------------------------
describe("POST /stripe/create-checkout-session", () => {
  it("returns 400 when email is missing", async () => {
    const res = await request(app)
      .post("/stripe/create-checkout-session")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email required/i);
  });

  it("returns { url } on success", async () => {
    mockGetOrCreateCustomer.mockResolvedValue("cus_123");
    mockCreateCheckoutSession.mockResolvedValue("https://checkout.stripe.com/abc");

    const res = await request(app)
      .post("/stripe/create-checkout-session")
      .send({ email: "test@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.url).toBe("https://checkout.stripe.com/abc");
  });

  it("returns 500 when service throws", async () => {
    mockGetOrCreateCustomer.mockRejectedValue(new Error("stripe down"));

    const res = await request(app)
      .post("/stripe/create-checkout-session")
      .send({ email: "test@example.com" });

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /stripe/create-portal-session
// ---------------------------------------------------------------------------
describe("POST /stripe/create-portal-session", () => {
  it("returns 400 when no Stripe customer on profile", async () => {
    profileRow = null;

    const res = await request(app)
      .post("/stripe/create-portal-session")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no stripe customer/i);
  });

  it("returns { url } on success", async () => {
    profileRow = { stripe_customer_id: "cus_123" };
    mockCreatePortalSession.mockResolvedValue("https://billing.stripe.com/xyz");

    const res = await request(app)
      .post("/stripe/create-portal-session")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.url).toBe("https://billing.stripe.com/xyz");
  });

  it("returns 500 when service throws", async () => {
    profileRow = { stripe_customer_id: "cus_123" };
    mockCreatePortalSession.mockRejectedValue(new Error("stripe down"));

    const res = await request(app)
      .post("/stripe/create-portal-session")
      .send({});

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /stripe/webhook
// ---------------------------------------------------------------------------
describe("POST /stripe/webhook", () => {
  it("returns 400 when stripe-signature header is missing", async () => {
    const res = await request(app)
      .post("/stripe/webhook")
      .set("Content-Type", "application/json")
      .send(Buffer.from("{}"));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing stripe-signature/i);
  });

  it("returns 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("signature mismatch");
    });

    const res = await request(app)
      .post("/stripe/webhook")
      .set("stripe-signature", "bad-sig")
      .set("Content-Type", "application/json")
      .send(Buffer.from("{}"));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid signature/i);
  });

  it("handles checkout.session.completed and upserts subscription_status active", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { metadata: { userId: "test-user" } } },
    });

    const res = await request(app)
      .post("/stripe/webhook")
      .set("stripe-signature", "valid-sig")
      .set("Content-Type", "application/json")
      .send(Buffer.from("{}"));

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "test-user", subscription_status: "active" }),
    );
  });

  it("handles customer.subscription.updated and updates subscription_status", async () => {
    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: { object: { customer: "cus_123", status: "past_due" } },
    });

    const res = await request(app)
      .post("/stripe/webhook")
      .set("stripe-signature", "valid-sig")
      .set("Content-Type", "application/json")
      .send(Buffer.from("{}"));

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ subscription_status: "past_due" }),
    );
  });

  it("handles customer.subscription.deleted and sets subscription_status inactive", async () => {
    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: { customer: "cus_123", status: "canceled" } },
    });

    const res = await request(app)
      .post("/stripe/webhook")
      .set("stripe-signature", "valid-sig")
      .set("Content-Type", "application/json")
      .send(Buffer.from("{}"));

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ subscription_status: "inactive" }),
    );
  });
});
