import { Router } from "express";
import express from "express";
import type Stripe from "stripe";
import {
  stripe,
  getOrCreateCustomer,
  createCheckoutSession,
  createPortalSession,
} from "../services/stripe.js";
import { supabase } from "../services/supabase.js";

// Webhook router — must receive raw body for signature verification
export const webhookRouter = Router();

webhookRouter.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    if (!sig) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body as Buffer,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!,
      );
    } catch {
      res.status(400).json({ error: "Invalid signature" });
      return;
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        if (userId) {
          await supabase.from("profiles").upsert({
            id: userId,
            subscription_status: "active",
            updated_at: new Date().toISOString(),
          });
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        await supabase
          .from("profiles")
          .update({ subscription_status: sub.status, updated_at: new Date().toISOString() })
          .eq("stripe_customer_id", customerId);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        await supabase
          .from("profiles")
          .update({ subscription_status: "inactive", updated_at: new Date().toISOString() })
          .eq("stripe_customer_id", customerId);
        break;
      }
    }

    res.json({ received: true });
  },
);

// Authenticated routes — require parsed JSON body
const router = Router();

router.post("/create-checkout-session", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) {
    res.status(400).json({ error: "Email required" });
    return;
  }

  try {
    const customerId = await getOrCreateCustomer(req.userId, email);
    const url = await createCheckoutSession(customerId, req.userId);
    res.json({ url });
  } catch {
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.post("/create-portal-session", async (req, res) => {
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", req.userId)
    .single();

  if (!profile?.stripe_customer_id) {
    res.status(400).json({ error: "No Stripe customer found for this user" });
    return;
  }

  try {
    const url = await createPortalSession(
      profile.stripe_customer_id as string,
    );
    res.json({ url });
  } catch {
    res.status(500).json({ error: "Failed to create portal session" });
  }
});

export default router;
