import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockCustomerCreate,
  mockSessionCreate,
  mockPortalCreate,
  mockSupabaseUpsert,
  mockSupabaseFrom,
} = vi.hoisted(() => ({
  mockCustomerCreate: vi.fn(),
  mockSessionCreate: vi.fn(),
  mockPortalCreate: vi.fn(),
  mockSupabaseUpsert: vi.fn().mockResolvedValue({ error: null }),
  mockSupabaseFrom: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: vi.fn(function () {
    return {
      customers: { create: mockCustomerCreate },
      checkout: { sessions: { create: mockSessionCreate } },
      billingPortal: { sessions: { create: mockPortalCreate } },
    };
  }),
}));

vi.mock("./supabase.js", () => ({
  supabase: {
    from: mockSupabaseFrom,
  },
}));

import {
  getOrCreateCustomer,
  createCheckoutSession,
  createPortalSession,
} from "./stripe.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getOrCreateCustomer", () => {
  it("returns existing customer ID when profile already has one", async () => {
    mockSupabaseFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: { stripe_customer_id: "cus_existing" },
              error: null,
            }),
        }),
      }),
      upsert: mockSupabaseUpsert,
    });

    const result = await getOrCreateCustomer("user-1", "test@example.com");

    expect(result).toBe("cus_existing");
    expect(mockCustomerCreate).not.toHaveBeenCalled();
  });

  it("creates a new Stripe customer and saves it to the profile", async () => {
    mockSupabaseFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: { message: "not found" } }),
        }),
      }),
      upsert: mockSupabaseUpsert,
    });

    mockCustomerCreate.mockResolvedValue({ id: "cus_new" });

    const result = await getOrCreateCustomer("user-1", "test@example.com");

    expect(result).toBe("cus_new");
    expect(mockCustomerCreate).toHaveBeenCalledWith({
      email: "test@example.com",
      metadata: { supabaseUserId: "user-1" },
    });
    expect(mockSupabaseUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1", stripe_customer_id: "cus_new" }),
    );
  });
});

describe("createCheckoutSession", () => {
  it("returns the checkout session URL", async () => {
    mockSessionCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session_abc" });

    const url = await createCheckoutSession("cus_123", "user-1");

    expect(url).toBe("https://checkout.stripe.com/session_abc");
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_123",
        mode: "subscription",
        metadata: { userId: "user-1" },
      }),
    );
  });
});

describe("createPortalSession", () => {
  it("returns the portal session URL", async () => {
    mockPortalCreate.mockResolvedValue({ url: "https://billing.stripe.com/session_xyz" });

    const url = await createPortalSession("cus_123");

    expect(url).toBe("https://billing.stripe.com/session_xyz");
    expect(mockPortalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_123" }),
    );
  });
});
