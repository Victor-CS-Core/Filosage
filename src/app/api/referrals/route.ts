import { authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { apiRequestErrorResponse, assertTrustedMutation } from "@/lib/api-security";
import {
  listStoredDocumentsByField,
  runStoredDocumentTransaction,
} from "@/lib/firebase-server";
import { enforceBestEffortRateLimit } from "@/lib/request-rate-limit";

function referralCode() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 16);
}

async function referralSummary(uid: string, create: boolean) {
  const userPath = `users/${uid}`;
  const proposed = referralCode();
  const proposedPath = `referralCodes/${proposed}`;
  const code = await runStoredDocumentTransaction(
    create ? [userPath, proposedPath] : [userPath],
    (documents) => {
      const user = documents[userPath];
      if (!user) throw new Error("Account record not found.");
      const existing = typeof user.referralCode === "string" ? user.referralCode : undefined;
      if (existing || !create) return { writes: [], result: existing ?? null };
      if (documents[proposedPath]) throw new Error("Referral code collision.");
      const now = new Date().toISOString();
      return {
        writes: [
          { path: userPath, data: { ...user, referralCode: proposed, updatedAt: now } },
          { path: proposedPath, data: { code: proposed, ownerUid: uid, active: true, createdAt: now } },
        ],
        result: proposed,
      };
    },
  );
  if (!code) return { code: null, visitors: 0, courseStarts: 0, signups: 0, paid: 0 };

  const events = await listStoredDocumentsByField("productEvents", "referralCode", code, 2_000);
  const actors = new Set(events.flatMap((event) => typeof event.actorId === "string" ? [event.actorId] : []));
  return {
    code,
    visitors: actors.size,
    courseStarts: events.filter((event) => event.event === "course_started").length,
    signups: events.filter((event) => event.event === "signup_completed").length,
    paid: events.filter((event) => event.event === "subscription_started").length,
  };
}

export async function GET(request: Request) {
  try {
    const account = await requireAcceptedAccount(request);
    return Response.json(await referralSummary(account.uid, false), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return authorizationResponse(error)
      ?? apiRequestErrorResponse(error)
      ?? Response.json({ error: "Referral activity could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const limited = enforceBestEffortRateLimit(request, "referral-create", 10);
  if (limited) return limited;
  try {
    assertTrustedMutation(request);
    const account = await requireAcceptedAccount(request);
    return Response.json(await referralSummary(account.uid, true), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return authorizationResponse(error)
      ?? apiRequestErrorResponse(error)
      ?? Response.json({ error: "A referral link could not be created." }, { status: 500 });
  }
}
