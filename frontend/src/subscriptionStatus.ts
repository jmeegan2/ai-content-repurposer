export function isActiveSubscription(status: string | undefined) {
  return status === "active";
}

export function isPausedSubscription(status: string | undefined) {
  return status === "paused";
}

export function dashboardSubscriptionAction(status: string | undefined) {
  if (isActiveSubscription(status)) return "Add more credits";
  if (isPausedSubscription(status)) return "Resume plan";
  return "Upgrade";
}

export function pricingSubscriptionBadge(status: string | undefined) {
  if (isActiveSubscription(status)) return "Active";
  if (isPausedSubscription(status)) return "Paused";
  return null;
}
