import type Stripe from "stripe";

const BILLING_PORTAL_ACTIONS = ["manage", "change_plan", "cancel"] as const;

export type BillingPortalAction = (typeof BILLING_PORTAL_ACTIONS)[number];

export function stripeSubscriptionCustomerMatches(
  subscriptionCustomer: string | { id: string },
  expectedCustomerId: string,
) {
  const customerId = typeof subscriptionCustomer === "string"
    ? subscriptionCustomer
    : subscriptionCustomer.id;
  return customerId === expectedCustomerId;
}

export function parseBillingPortalRequest(value: unknown): BillingPortalAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).length !== 1 || !("action" in candidate)) return null;
  return BILLING_PORTAL_ACTIONS.find((action) => action === candidate.action) ?? null;
}

interface BillingPortalSessionInput {
  action: BillingPortalAction;
  customerId: string;
  configurationId: string;
  returnUrl: string;
  subscriptionId?: string;
  recoveryOnly?: boolean;
}

export function billingPortalSessionParameters(
  input: BillingPortalSessionInput,
): Stripe.BillingPortal.SessionCreateParams {
  const base = {
    customer: input.customerId,
    configuration: input.configurationId,
    return_url: input.returnUrl,
  } satisfies Stripe.BillingPortal.SessionCreateParams;
  if (input.action === "manage") return input.recoveryOnly ? {
    ...base,
    flow_data: {
      type: "payment_method_update",
      after_completion: { type: "redirect", redirect: { return_url: input.returnUrl } },
    },
  } : base;
  if (!input.subscriptionId?.startsWith("sub_")) {
    throw new Error("A Stripe subscription is required for this billing action.");
  }

  const afterCompletion = {
    type: "redirect" as const,
    redirect: { return_url: input.returnUrl },
  };
  if (input.action === "change_plan") {
    return {
      ...base,
      flow_data: {
        type: "subscription_update",
        subscription_update: { subscription: input.subscriptionId },
        after_completion: afterCompletion,
      },
    };
  }
  return {
    ...base,
    flow_data: {
      type: "subscription_cancel",
      subscription_cancel: { subscription: input.subscriptionId },
      after_completion: afterCompletion,
    },
  };
}
