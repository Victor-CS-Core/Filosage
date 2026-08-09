import { z } from "zod";
import { apiRequestErrorResponse, assertTrustedMutation, readJsonBody } from "@/lib/api-security";
import {
  getStoredDocument,
  putStoredDocument,
} from "@/lib/firebase-server";
import { enforceDurableRateLimit } from "@/lib/request-rate-limit";
import { recordServerProductEvent } from "@/lib/product-events-server";

const waitlistSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(254),
  marketingConsent: z.literal(true, {
    error: "Confirm that Filosage may email you about the Pro launch.",
  }),
}).strict();

async function emailFingerprint(email: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  try {
    assertTrustedMutation(request);
    const limited = await enforceDurableRateLimit(request, "waitlist", 5, 10 * 60_000);
    if (limited) return limited;
    const parsed = waitlistSchema.safeParse(await readJsonBody(request, 1_024));
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Check your email and try again." },
        { status: 400 },
      );
    }

    const email = parsed.data.email.toLowerCase();
    const id = await emailFingerprint(email);
    const path = `waitlist/${id}`;
    const existing = await getStoredDocument(path);
    const now = new Date().toISOString();
    await putStoredDocument(path, {
      email,
      status: "waiting",
      source: "pricing",
      marketingConsent: true,
      consentedAt: typeof existing?.consentedAt === "string" ? existing.consentedAt : now,
      createdAt: typeof existing?.createdAt === "string" ? existing.createdAt : now,
      updatedAt: now,
    });
    if (!existing) {
      await recordServerProductEvent("waitlist_joined", {
        route: "/pricing",
        eventId: `waitlist-${id}`,
      });
    }

    return Response.json(
      { joined: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? Response.json({ error: "The launch list could not be updated. Please try again." }, { status: 500 });
  }
}
