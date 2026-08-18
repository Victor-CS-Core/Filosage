import { NextRequest, NextResponse } from "next/server";
import { apiRequestErrorResponse, assertTrustedMutation } from "@/lib/api-security";
import { recordAuthenticationEvent, type AuthenticationEventReason } from "@/lib/auth-audit";
import { authorizationResponse, requireProviderIdentity } from "@/lib/auth-server";
import {
  completeIdentityLinkIntent,
  LinkIntentError,
} from "@/lib/identity-link-server";
import { enforceDurableRateLimit } from "@/lib/request-rate-limit";
import { serverEnvironment } from "@/lib/runtime-environment";

const INTENT_COOKIE = "filosage_identity_link_intent";
const COMPLETE_PATH = "/api/auth/link-intent/complete";
const PRIVATE_NO_STORE = "private, no-store";

function privateNoStore<T extends Response>(response: T) {
  response.headers.set("Cache-Control", PRIVATE_NO_STORE);
  return response;
}

function cookieSecurityAttributes() {
  return {
    httpOnly: true,
    secure: serverEnvironment.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: COMPLETE_PATH,
  };
}

function clearIntentCookie(response: NextResponse) {
  response.cookies.set({
    name: INTENT_COOKIE,
    value: "",
    ...cookieSecurityAttributes(),
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
    const limited = await enforceDurableRateLimit(
      request,
      "identity-link-complete",
      8,
      10 * 60_000,
    );
    if (limited) return privateNoStore(limited);

    const identity = await requireProviderIdentity(request);
    const token = request.cookies.get(INTENT_COOKIE)?.value ?? "";
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
    return NextResponse.json(
      { error: "The sign-in connection could not be completed." },
      { status: 503, headers: { "Cache-Control": PRIVATE_NO_STORE } },
    );
  }
}
