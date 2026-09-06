import { withAccountRequest } from "@/lib/auth-server";
import { currentAccountGeneration } from "@/lib/account-lifecycle";
import { getVerifiedUser } from "@/lib/auth-server";
import { authenticationRuntimeConfiguration } from "@/lib/auth-runtime";
import { providerDisplayName } from "@/lib/display-name";
import { hasRecentAuthentication } from "@/lib/recent-auth";

async function handleGET(request: Request) {
  const configuration = authenticationRuntimeConfiguration();
  const externalIdNewAccountsAvailable = configuration.externalIdEnabled
    && configuration.externalIdNewAccountsEnabled;
  const primaryProvider = externalIdNewAccountsAvailable
    ? "filosage"
    : configuration.directGoogleEnabled
      ? "google"
      : configuration.externalIdEnabled
        ? "filosage"
        : null;
  const user = await getVerifiedUser(request);
  return Response.json({
    recentAuthentication: Boolean(user && hasRecentAuthentication(user.auth_time)),
    authentication: {
      primaryProvider,
      externalIdAvailable: configuration.externalIdEnabled,
      externalIdNewAccountsAvailable,
      legacyGoogleAvailable: configuration.directGoogleEnabled,
    },
    user: user ? {
      uid: user.uid,
      accountGeneration: currentAccountGeneration()?.generation,
      displayName: providerDisplayName(user.name, user.email),
      email: user.email,
      photoURL: user.picture ?? null,
      authenticationProvider: user.providerIdentity.provider,
    } : null,
  }, {
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
    },
  });
}

export const GET = withAccountRequest(handleGET);
