import { authorizationResponse, requireAccount } from "@/lib/auth-server";
import { getAiQuotaSummaries } from "@/lib/ai-usage";

export async function GET(request: Request) {
  try {
    const account = await requireAccount(request);
    const quotas = await getAiQuotaSummaries(account);
    return Response.json(
      {
        access: account.access,
        plan: account.plan,
        isOwner: account.isOwner,
        displayName: account.displayName,
        photoURL: account.photoURL,
        subscriptionStatus: account.subscriptionStatus,
        currentPeriodEnd: account.currentPeriodEnd,
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
