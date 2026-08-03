import { z } from "zod";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { authorizationResponse, requireUser } from "@/lib/auth-server";
import { isOwnerUser } from "@/lib/account-server";
import { runStoredDocumentTransaction } from "@/lib/firebase-server";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";

const acceptanceSchema = z.object({
  termsVersion: z.literal(TERMS_VERSION),
  privacyVersion: z.literal(PRIVACY_VERSION),
  ageEligibilityConfirmed: z.literal(true),
  source: z.enum(["signup", "terms-update", "subscription"]),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const parsed = acceptanceSchema.safeParse(await readJsonBody(request, 2_048));
    if (!parsed.success) return Response.json({ error: "The legal acceptance is not current." }, { status: 400 });
    const acceptedAt = new Date().toISOString();
    const id = `${TERMS_VERSION}__${PRIVACY_VERSION}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    const accountPath = `users/${user.uid}`;
    const acceptancePath = `${accountPath}/legalAcceptances/${id}`;
    await runStoredDocumentTransaction([accountPath, acceptancePath], (documents) => {
      const existingAccount = documents[accountPath];
      const existingAcceptance = documents[acceptancePath];
      const hasPriorLegalAcceptance = Boolean(existingAccount)
        && (typeof existingAccount?.acceptedTermsVersion === "string"
          || typeof existingAccount?.acceptedPrivacyVersion === "string");
      // Consent stage is server-derived from durable account state. The client
      // can report UI context, but cannot label an initial acceptance as an
      // update (or vice versa) in the audit record.
      const source = hasPriorLegalAcceptance ? "terms-update" : "signup";
      const context = parsed.data.source === "subscription" ? "subscription" : "account";
      const sources = Array.from(new Set([
        ...(Array.isArray(existingAcceptance?.sources)
          ? existingAcceptance.sources.filter((value): value is string => typeof value === "string")
          : typeof existingAcceptance?.source === "string" ? [existingAcceptance.source] : []),
        source,
      ]));
      const contexts = Array.from(new Set([
        ...(Array.isArray(existingAcceptance?.contexts)
          ? existingAcceptance.contexts.filter((value): value is string => typeof value === "string")
          : typeof existingAcceptance?.context === "string" ? [existingAcceptance.context] : []),
        context,
      ]));
      return {
        writes: [
          {
            path: acceptancePath,
            data: {
              ...(existingAcceptance ?? {}),
              uid: user.uid,
              termsVersion: parsed.data.termsVersion,
              privacyVersion: parsed.data.privacyVersion,
              ageEligibilityConfirmed: parsed.data.ageEligibilityConfirmed,
              source,
              context,
              acceptedAt: typeof existingAcceptance?.acceptedAt === "string"
                ? existingAcceptance.acceptedAt
                : acceptedAt,
              lastAcceptedAt: acceptedAt,
              sources,
              contexts,
              userAgent: (request.headers.get("user-agent") ?? "unknown").slice(0, 300),
            },
          },
          {
            path: accountPath,
            data: {
              ...(existingAccount ?? {}),
              uid: user.uid,
              email: user.email?.trim().toLowerCase() ?? existingAccount?.email ?? null,
              displayName: user.name ?? existingAccount?.displayName ?? null,
              photoURL: user.picture ?? existingAccount?.photoURL ?? null,
              plan: isOwnerUser(user) ? "pro" : existingAccount?.plan ?? "free",
              accountStatus: isOwnerUser(user)
                ? "active"
                : existingAccount?.accountStatus === "suspended" ? "suspended" : "active",
              subscriptionStatus: existingAccount?.subscriptionStatus ?? "none",
              acceptedTermsVersion: TERMS_VERSION,
              acceptedPrivacyVersion: PRIVACY_VERSION,
              ageEligibilityConfirmed: true,
              legalAcceptedAt: acceptedAt,
              createdAt: existingAccount?.createdAt ?? acceptedAt,
              updatedAt: acceptedAt,
            },
          },
        ],
        result: undefined,
      };
    });
    return Response.json({ accepted: true, acceptedAt }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "Your acceptance could not be saved." }, { status: 500 });
  }
}
