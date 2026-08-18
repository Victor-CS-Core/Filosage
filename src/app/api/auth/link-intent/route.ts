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
import {
  IDENTITY_LINK_INTENT_COOKIE,
  identityLinkCookieAttributes,
} from "@/lib/identity-link-cookie";
import { unexpectedIdentityLinkResponse } from "@/lib/identity-link-route-failure";
import { enforceDurableRateLimit } from "@/lib/request-rate-limit";
import { serverEnvironment } from "@/lib/runtime-environment";

const COMPLETE_PAGE = "/auth/complete-link";
const PRIVATE_NO_STORE = "private, no-store";

function privateNoStore<T extends Response>(response: T) {
  response.headers.set("Cache-Control", PRIVATE_NO_STORE);
  return response;
}

function deniedReason(error: LinkIntentError): AuthenticationEventReason {
  return error.reason === "invalid" ? "mapping_conflict" : error.reason;
}

function clearIntentCookie(response: NextResponse) {
  response.cookies.set({
    name: IDENTITY_LINK_INTENT_COOKIE,
    value: "",
    ...identityLinkCookieAttributes(serverEnvironment.NODE_ENV),
    maxAge: 0,
  });
  return response;
}

function terminalLinkResponse(error: LinkIntentError) {
  const correlationId = crypto.randomUUID();
  recordAuthenticationEvent({
    code: "account.identity_link_failed",
    outcome: "denied",
    correlationId,
    reason: deniedReason(error),
  });
  return clearIntentCookie(NextResponse.json(
    { error: error.message, correlationId },
    { status: 409, headers: { "Cache-Control": PRIVATE_NO_STORE } },
  ));
}

export async function POST(request: Request) {
  try {
    assertTrustedMutation(request);
    const user = await requireRecentlyAuthenticatedUser(
      request,
      "Sign in again with your existing Google method before connecting a new sign-in.",
      "recent_authentication_required",
    );
    const limited = await enforceDurableRateLimit(
      request,
      "identity-link-create",
      5,
      10 * 60_000,
      user.uid,
    );
    if (limited) return privateNoStore(limited);

    const account = await getExistingAccount(user);
    if (!account || !hasCurrentLegalAcceptance(account)) {
      return NextResponse.json(
        { error: "The secure connection could not be started." },
        { status: 403, headers: { "Cache-Control": PRIVATE_NO_STORE } },
      );
    }

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
      name: IDENTITY_LINK_INTENT_COOKIE,
      value: intent.token,
      ...identityLinkCookieAttributes(serverEnvironment.NODE_ENV),
      maxAge: 600,
    });
    return response;
  } catch (error) {
    if (error instanceof LinkIntentError) return terminalLinkResponse(error);
    const requestError = apiRequestErrorResponse(error);
    if (requestError) return privateNoStore(requestError);
    const authorizationError = authorizationResponse(error);
    if (authorizationError) return privateNoStore(authorizationError);
    return unexpectedIdentityLinkResponse("The secure connection could not be started.");
  }
}
