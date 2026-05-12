import Stripe from "stripe";
import { supabase } from "./supabase.js";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia",
});

export async function getOrCreateCustomer(
  userId: string,
  email: string,
): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();

  if (profile?.stripe_customer_id) {
    return profile.stripe_customer_id as string;
  }

  const customer = await stripe.customers.create({
    email,
    metadata: { supabaseUserId: userId },
  });

  await supabase.from("profiles").upsert({
    id: userId,
    stripe_customer_id: customer.id,
    updated_at: new Date().toISOString(),
  });

  return customer.id;
}

export async function createCheckoutSession(
  customerId: string,
  userId: string,
): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    success_url: `${process.env.FRONTEND_URL ?? "http://localhost:5173"}/?checkout=success`,
    cancel_url: `${process.env.FRONTEND_URL ?? "http://localhost:5173"}/`,
    metadata: { userId },
  });

  return session.url!;
}

export async function createPortalSession(customerId: string): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.FRONTEND_URL ?? "http://localhost:5173"}/`,
  });

  return session.url;
}
