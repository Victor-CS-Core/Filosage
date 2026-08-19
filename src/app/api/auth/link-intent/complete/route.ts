import { NextRequest, NextResponse } from "next/server";
import { apiRequestErrorResponse, assertTrustedMutation } from "@/lib/api-security";
import { recordAuthenticationEvent, type AuthenticationEventReason } from "@/lib/auth-audit";
import { authorizationResponse, requireProviderIdentity } from "@/lib/auth-server";
import {
  completeIdentityLinkIntent,
  configuredOpaqueProviderIdentityKey,
  LinkIntentError,
} from "@/lib/identity-link-server";
import {
  IDENTITY_LINK_INTENT_COOKIE,
  identityLinkCookieAttributes,
} from "@/lib/identity-link-cookie";
import { unexpectedIdentityLinkResponse } from "@/lib/identity-link-route-failure";
import { enforceDurableRateLimit } from "@/lib/request-rate-limit";
import { serverEnvironment } from "@/lib/runtime-environment";

const PRIVATE_NO_STORE = "private, no-store";

function privateNoStore<T extends Response>(response: T) {
  response.headers.set("Cache-Control", PRIVATE_NO_STORE);
  return response;
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
  return clearIntentCookie(NextResponse.json(
    { error: error.message, correlationId },
    { status: 409, headers: { "Cache-Control": PRIVATE_NO_STORE } },
  ));
}

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const identity = await requireProviderIdentity(request);
    const rateKey = await configuredOpaqueProviderIdentityKey(
      "identity-link-complete-rate",
      identity,
    );
    const limited = await enforceDurableRateLimit(
      request,
      "identity-link-complete",
      8,
      10 * 60_000,
      rateKey,
      "identity",
    );
    if (limited) return privateNoStore(limited);

    const token = request.cookies.get(IDENTITY_LINK_INTENT_COOKIE)?.value ?? "";
    const result = await completeIdentityLinkIntent(token, identity);
    return clearIntentCookie(NextResponse.json(
      { linked: true, returnPath: result.returnPath },
      { headers: { "Cache-Control": PRIVATE_NO_STORE } },
    ));
  } catch (error) {
    if (error instanceof LinkIntentError) return terminalLinkResponse(error);
    const requestError = apiRequestErrorResponse(error);
    if (requestError) return privateNoStore(requestError);
    const authorizationError = authorizationResponse(error);
    if (authorizationError) return privateNoStore(authorizationError);
    return unexpectedIdentityLinkResponse("The sign-in connection could not be completed.");
  }
}
