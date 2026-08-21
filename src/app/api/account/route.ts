import { z } from "zod";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import {
  authorizationResponse,
  hasCurrentLegalAcceptance,
  requireAcceptedAccount,
  requireUser,
} from "@/lib/auth-server";
import { getExistingAccount } from "@/lib/account-server";
import { getAiQuotaSummaries } from "@/lib/ai-usage";
import { courseCreditSummaryForAccount } from "@/lib/course-credits";
import { identityOnboardingState } from "@/lib/identity-link-server";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { capabilitiesForAccount } from "@/lib/membership-access";
import { normalizeDisplayName, providerDisplayName } from "@/lib/display-name";
import { runStoredDocumentTransaction } from "@/lib/document-store";

const displayNameSchema = z.object({ displayName: z.string() }).strict();
const privateNoStoreHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const onboardingState = await identityOnboardingState(user);
    if (onboardingState === "identity_link_required") {
      return Response.json({
        access: "free",
        plan: "free",
        isOwner: false,
        accountStatus: "active",
        displayName: providerDisplayName(user.name, user.email) ?? undefined,
        photoURL: user.picture,
        subscriptionStatus: "none",
        capabilities: {
          createCourse: false,
          generateLesson: false,
          flashcardDecksEnabled: false,
          createCustomFlashcardDeck: false,
          publishCourse: false,
          advancedCapstoneAnalysis: false,
          exportEvidenceReport: false,
          shareEvidenceReport: false,
        },
        courseCredits: { balance: 0, monthlyAllocation: 0, balanceCap: 0, nextAccrualAt: null, frozenUntil: null },
        legalAcceptanceRequired: false,
        applicationAccountExists: false,
        identityLinkRequired: true,
        currentTermsVersion: TERMS_VERSION,
        currentPrivacyVersion: PRIVACY_VERSION,
        quotas: [],
      }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const account = await getExistingAccount(user);
    if (!account) {
      return Response.json({
        access: "free",
        plan: "free",
        isOwner: false,
        accountStatus: "active",
        displayName: providerDisplayName(user.name, user.email) ?? undefined,
        photoURL: user.picture,
        subscriptionStatus: "none",
        capabilities: {
          createCourse: false,
          generateLesson: false,
          flashcardDecksEnabled: false,
          createCustomFlashcardDeck: false,
          publishCourse: false,
          advancedCapstoneAnalysis: false,
          exportEvidenceReport: false,
          shareEvidenceReport: false,
        },
        courseCredits: { balance: 0, monthlyAllocation: 0, balanceCap: 0, nextAccrualAt: null, frozenUntil: null },
        legalAcceptanceRequired: true,
        applicationAccountExists: false,
        identityLinkRequired: false,
        currentTermsVersion: TERMS_VERSION,
        currentPrivacyVersion: PRIVACY_VERSION,
        quotas: [],
      }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const [quotas, courseCredits] = await Promise.all([
      getAiQuotaSummaries(account),
      courseCreditSummaryForAccount(account),
    ]);
    return Response.json(
      {
        access: account.access,
        plan: account.plan,
        isOwner: account.isOwner,
        accountStatus: account.accountStatus,
        suspensionReason: account.suspensionReason,
        displayName: account.displayName,
        photoURL: account.photoURL,
        subscriptionStatus: account.subscriptionStatus,
        billingInterval: account.billingInterval,
        currentPeriodEnd: account.currentPeriodEnd,
        capabilities: capabilitiesForAccount(account),
        courseCredits,
        acceptedTermsVersion: account.acceptedTermsVersion,
        acceptedPrivacyVersion: account.acceptedPrivacyVersion,
        legalAcceptanceRequired: !hasCurrentLegalAcceptance(account),
        applicationAccountExists: true,
        identityLinkRequired: false,
        currentTermsVersion: TERMS_VERSION,
        currentPrivacyVersion: PRIVACY_VERSION,
        quotas,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error("Account fetch failed:", error);
    return Response.json({ error: "Your account is temporarily unavailable." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const account = await requireAcceptedAccount(request);
    const parsed = displayNameSchema.safeParse(await readJsonBody(request, 1_024));
    const displayName = parsed.success ? normalizeDisplayName(parsed.data.displayName) : null;
    if (!displayName) {
      return Response.json(
        { error: "Enter a name between 1 and 80 characters." },
        { status: 400, headers: privateNoStoreHeaders },
      );
    }
    const path = `users/${account.uid}`;
    await runStoredDocumentTransaction([path], (documents) => {
      const existing = documents[path];
      if (!existing) throw new Error("Learner account is unavailable.");
      return {
        writes: [{
          path,
          data: {
            ...existing,
            displayName,
            updatedAt: new Date().toISOString(),
          },
        }],
        result: null,
      };
    });

    return Response.json({ displayName }, { headers: privateNoStoreHeaders });
  } catch (error) {
    const requestError = apiRequestErrorResponse(error);
    if (requestError) return requestError;
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error("Account name update failed.");
    return Response.json(
      { error: "Your name could not be updated. Try again." },
      { status: 500, headers: privateNoStoreHeaders },
    );
  }
}
