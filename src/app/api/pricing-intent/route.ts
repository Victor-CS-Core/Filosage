import { z } from "zod";
import { authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import {
  getStoredDocument,
  runStoredDocumentTransaction,
} from "@/lib/firebase-server";
import { enforceBestEffortRateLimit } from "@/lib/request-rate-limit";

const pricingIntentSchema = z.object({
  interval: z.enum(["monthly", "annual"]),
  readiness: z.enum(["ready_now", "within_30_days", "researching"]),
  launchEmailConsent: z.boolean(),
}).strict();

function publicIntent(document: Record<string, unknown> | null) {
  if (!document) return null;
  if (document.interval !== "monthly" && document.interval !== "annual") return null;
  if (!["ready_now", "within_30_days", "researching"].includes(String(document.readiness))) return null;
  return {
    interval: document.interval,
    readiness: document.readiness,
    launchEmailConsent: document.launchEmailConsent === true,
    updatedAt: typeof document.updatedAt === "string" ? document.updatedAt : undefined,
  };
}

async function emailFingerprint(email: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function GET(request: Request) {
  try {
    const account = await requireAcceptedAccount(request);
    const intent = await getStoredDocument(`pricingIntents/${account.uid}`);
    return Response.json({ intent: publicIntent(intent) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return authorizationResponse(error)
      ?? apiRequestErrorResponse(error)
      ?? Response.json({ error: "Your launch preference could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const limited = enforceBestEffortRateLimit(request, "pricing-intent", 12, 60 * 60_000);
  if (limited) return limited;

  try {
    const parsed = pricingIntentSchema.safeParse(await readJsonBody(request, 2_048));
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Choose a plan and launch timeline." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const account = await requireAcceptedAccount(request);
    if (account.isOwner || account.plan === "pro") {
      return Response.json(
        { error: "Launch preferences are collected from Free accounts that do not already have Pro access." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (parsed.data.launchEmailConsent && !account.email) {
      return Response.json(
        { error: "Your verified account does not include an email address." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const now = new Date().toISOString();
    const intentPath = `pricingIntents/${account.uid}`;
    const eventPath = `productEvents/pricing-interest-${account.uid}`;
    const waitlistPath = parsed.data.launchEmailConsent && account.email
      ? `waitlist/${await emailFingerprint(account.email)}`
      : null;
    const paths = [intentPath, eventPath, ...(waitlistPath ? [waitlistPath] : [])];

    const intent = await runStoredDocumentTransaction(paths, (documents) => {
      const existingIntent = documents[intentPath];
      const existingEvent = documents[eventPath];
      const nextIntent = {
        uid: account.uid,
        interval: parsed.data.interval,
        readiness: parsed.data.readiness,
        launchEmailConsent: parsed.data.launchEmailConsent || existingIntent?.launchEmailConsent === true,
        offerVersion: "pro-v1-closed-launch",
        plannedMonthlyPriceUsd: 14.99,
        plannedAnnualPriceUsd: 119.88,
        createdAt: typeof existingIntent?.createdAt === "string" ? existingIntent.createdAt : now,
        updatedAt: now,
      };
      const writes: Array<{ path: string; data: Record<string, unknown> }> = [
        { path: intentPath, data: nextIntent },
        {
          path: eventPath,
          data: {
            schemaVersion: 1,
            date: typeof existingEvent?.date === "string" ? existingEvent.date : now.slice(0, 10),
            route: "/pricing",
            source: "internal",
            channel: "internal",
            event: "pricing_interest",
            actorId: account.uid,
            createdAt: typeof existingEvent?.createdAt === "string" ? existingEvent.createdAt : now,
            updatedAt: now,
          },
        },
      ];
      if (waitlistPath && account.email) {
        const existingWaitlist = documents[waitlistPath];
        writes.push({
          path: waitlistPath,
          data: {
            email: account.email,
            status: "waiting",
            source: "pricing-intent",
            marketingConsent: true,
            consentedAt: typeof existingWaitlist?.consentedAt === "string" ? existingWaitlist.consentedAt : now,
            createdAt: typeof existingWaitlist?.createdAt === "string" ? existingWaitlist.createdAt : now,
            updatedAt: now,
          },
        });
      }
      return { writes, result: nextIntent };
    });

    return Response.json({ saved: true, intent: publicIntent(intent) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return authorizationResponse(error)
      ?? apiRequestErrorResponse(error)
      ?? Response.json({ error: "Your launch preference could not be saved." }, { status: 500 });
  }
}
