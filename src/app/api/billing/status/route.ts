import { billingStatus } from "@/lib/billing";

export function GET() {
  return Response.json(billingStatus(), { headers: { "Cache-Control": "public, max-age=60" } });
}
