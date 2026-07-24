import { billingConfiguration } from "@/lib/runtime-config";

export async function POST() {
  if (!billingConfiguration().configured) return Response.json({ error: "Billing is not configured." }, { status: 503 });
  return Response.json({ error: "Webhook verification and entitlement handling are not enabled in this deployment." }, { status: 501 });
}
