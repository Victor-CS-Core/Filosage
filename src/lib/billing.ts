import "server-only";

import { billingConfiguration } from "@/lib/runtime-config";
import {
  ACTIVE_MEMBERSHIP_PLANS,
  annualMonthlyEquivalentMinor,
  annualSavingsMinor,
  annualSavingsPercent,
  type PaidLearnerPlan,
} from "@/lib/membership-plans";

function publicPlan(plan: (typeof ACTIVE_MEMBERSHIP_PLANS)[number]) {
  const paid: PaidLearnerPlan | null = plan.id === "plus" || plan.id === "pro" ? plan.id : null;
  return {
    id: plan.id,
    name: plan.name,
    shortName: plan.shortName,
    description: plan.description,
    sortOrder: plan.sortOrder,
    active: plan.active,
    currency: plan.currency,
    prices: plan.prices,
    annualMonthlyEquivalentMinor: paid ? annualMonthlyEquivalentMinor(paid) : null,
    annualSavingsMinor: paid ? annualSavingsMinor(paid) : null,
    annualSavingsPercent: paid ? annualSavingsPercent(paid) : null,
    limits: plan.limits,
    capabilities: plan.capabilities,
    includedFeatures: plan.includedFeatures,
    restrictedFeatures: plan.restrictedFeatures,
  };
}

export const publicMembershipPlans = ACTIVE_MEMBERSHIP_PLANS.map(publicPlan);

export function billingStatus() {
  const config = billingConfiguration();
  return {
    provider: config.provider,
    enabled: config.enabled,
    managementReady: config.managementReady,
    checkoutReady: config.checkoutReady,
    ready: config.checkoutReady,
    plans: publicMembershipPlans,
  };
}
