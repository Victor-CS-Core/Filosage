import { getVerifiedUser } from "@/lib/auth-server";
import { authenticationRuntimeConfiguration } from "@/lib/auth-runtime";
import { providerDisplayName } from "@/lib/display-name";
import { hasRecentAuthentication } from "@/lib/recent-auth";

export async function GET(request: Request) {
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
