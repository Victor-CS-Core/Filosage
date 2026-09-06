import { supportSubmissionEnabled } from "@/lib/support-availability";
import type { SupportCapabilities } from "@/lib/support-capabilities";

// Public availability contains no owner controls, account data or secret values.
export async function GET() {
  try {
    return Response.json({ submissionEnabled: await supportSubmissionEnabled(), historyEnabled: true } satisfies SupportCapabilities, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Support availability could not be confirmed." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
