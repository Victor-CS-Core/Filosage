import { NextResponse } from "next/server";
import { getExistingAccount } from "@/lib/account-server";
import { apiRequestErrorResponse, assertTrustedMutation } from "@/lib/api-security";
import { recordAuthenticationEvent, type AuthenticationEventReason } from "@/lib/auth-audit";
import {
  authorizationResponse,
  hasCurrentLegalAcceptance,
  requireRecentlyAuthenticatedUser,
} from "@/lib/auth-server";
import {
  createIdentityLinkIntent,
  LinkIntentError,
} from "@/lib/identity-link-server";
import { enforceDurableRateLimit } from "@/lib/request-rate-limit";
import { serverEnvironment } from "@/lib/runtime-environment";

const INTENT_COOKIE = "filosage_identity_link_intent";
const COMPLETE_PATH = "/api/auth/link-intent/complete";
const COMPLETE_PAGE = "/auth/complete-link";
const PRIVATE_NO_STORE = "private, no-store";

function privateNoStore<T extends Response>(response: T) {
  response.headers.set("Cache-Control", PRIVATE_NO_STORE);
  return response;
}

function deniedReason(error: LinkIntentError): AuthenticationEventReason {
  return error.reason === "invalid" ? "mapping_conflict" : error.reason;
}

function terminalLinkResponse(error: LinkIntentError) {
  const correlationId = crypto.randomUUID();
  recordAuthenticationEvent({
    code: "account.identity_link_failed",
    outcome: "denied",
    correlationId,
    reason: deniedReason(error),
  });
  return NextResponse.json(
    { error: error.message, correlationId },
    { status: 409, headers: { "Cache-Control": PRIVATE_NO_STORE } },
  );
}

export async function POST(request: Request) {
  try {
    assertTrustedMutation(request);
    const user = await requireRecentlyAuthenticatedUser(
      request,
      "Sign in again with your existing Google method before connecting a new sign-in.",
      "recent_authentication_required",
    );
    const account = await getExistingAccount(user);
    if (!account || !hasCurrentLegalAcceptance(account)) {
      return NextResponse.json(
        { error: "The secure connection could not be started." },
        { status: 403, headers: { "Cache-Control": PRIVATE_NO_STORE } },
      );
    }

    const limited = await enforceDurableRateLimit(
      request,
      "identity-link-create",
      5,
      10 * 60_000,
      user.uid,
    );
    if (limited) return privateNoStore(limited);

    const returnPath = new URL(request.url).searchParams.get("return") ?? "/profile";
    const intent = await createIdentityLinkIntent(user, returnPath);
    const response = NextResponse.json(
      {
        redirectTo: `/.auth/login/filosage?post_login_redirect_uri=${encodeURIComponent(COMPLETE_PAGE)}`,
        expiresAt: intent.expiresAt,
      },
      { headers: { "Cache-Control": PRIVATE_NO_STORE } },
    );
    response.cookies.set({
      name: INTENT_COOKIE,
      value: intent.token,
      httpOnly: true,
      secure: serverEnvironment.NODE_ENV === "production",
      sameSite: "lax",
      path: COMPLETE_PATH,
      maxAge: 600,
    });
    return response;
  } catch (error) {
    if (error instanceof LinkIntentError) return terminalLinkResponse(error);
    const requestError = apiRequestErrorResponse(error);
    if (requestError) return privateNoStore(requestError);
    const authorizationError = authorizationResponse(error);
    if (authorizationError) return privateNoStore(authorizationError);
    return NextResponse.json(
      { error: "The secure connection could not be started." },
      { status: 503, headers: { "Cache-Control": PRIVATE_NO_STORE } },
    );
  }
}
