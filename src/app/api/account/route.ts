import { authorizationResponse, hasCurrentLegalAcceptance, requireUser } from "@/lib/auth-server";
import { getExistingAccount } from "@/lib/account-server";
import { getAiQuotaSummaries } from "@/lib/ai-usage";
import { courseCreditSummaryForAccount } from "@/lib/course-credits";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { capabilitiesForAccount } from "@/lib/membership-access";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const account = await getExistingAccount(user);
    if (!account) {
      return Response.json({
        access: "free",
        plan: "free",
        isOwner: false,
        accountStatus: "active",
        displayName: user.name,
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
