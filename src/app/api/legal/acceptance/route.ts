import { z } from "zod";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { authorizationResponse, requireAccount } from "@/lib/auth-server";
import { getStoredDocument, putStoredDocument } from "@/lib/firebase-server";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";

const acceptanceSchema = z.object({
  termsVersion: z.literal(TERMS_VERSION),
  privacyVersion: z.literal(PRIVACY_VERSION),
  ageEligibilityConfirmed: z.literal(true),
  source: z.enum(["signup", "terms-update", "subscription"]),
});

export async function POST(request: Request) {
  try {
    const account = await requireAccount(request);
    const parsed = acceptanceSchema.safeParse(await readJsonBody(request, 2_048));
    if (!parsed.success) return Response.json({ error: "The legal acceptance is not current." }, { status: 400 });
    const acceptedAt = new Date().toISOString();
    const record = {
      uid: account.uid,
      ...parsed.data,
      acceptedAt,
      userAgent: (request.headers.get("user-agent") ?? "unknown").slice(0, 300),
    };
    const id = `${TERMS_VERSION}__${PRIVACY_VERSION}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    const existing = await getStoredDocument(`users/${account.uid}`);
    await Promise.all([
      putStoredDocument(`users/${account.uid}/legalAcceptances/${id}`, record),
      putStoredDocument(`users/${account.uid}`, {
        ...(existing ?? {}),
        acceptedTermsVersion: TERMS_VERSION,
        acceptedPrivacyVersion: PRIVACY_VERSION,
        ageEligibilityConfirmed: true,
        legalAcceptedAt: acceptedAt,
        updatedAt: acceptedAt,
      }),
    ]);
    return Response.json({ accepted: true, acceptedAt }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "Your acceptance could not be saved." }, { status: 500 });
  }
}
