import { describe, expect, it } from "vitest";
import {
  dashboardSubscriptionAction,
  isActiveSubscription,
  isPausedSubscription,
  pricingSubscriptionBadge,
} from "./subscriptionStatus";

describe("subscription status helpers", () => {
  it("treats active as the only active paid status", () => {
    expect(isActiveSubscription("active")).toBe(true);
    expect(isActiveSubscription("paused")).toBe(false);
    expect(isActiveSubscription("past_due")).toBe(false);
  });

  it("detects paused subscriptions as a distinct inactive state", () => {
    expect(isPausedSubscription("paused")).toBe(true);
    expect(isPausedSubscription("active")).toBe(false);
  });

  it("shows a resume action for paused subscriptions", () => {
    expect(dashboardSubscriptionAction("paused")).toBe("Resume plan");
    expect(dashboardSubscriptionAction("active")).toBe("Add more credits");
    expect(dashboardSubscriptionAction("inactive")).toBe("Upgrade");
  });

  it("shows pricing badges only for active or paused subscriptions", () => {
    expect(pricingSubscriptionBadge("active")).toBe("Active");
    expect(pricingSubscriptionBadge("paused")).toBe("Paused");
    expect(pricingSubscriptionBadge("inactive")).toBeNull();
  });
});
