import { getVerifiedUser } from "@/lib/auth-server";
import { authenticationRuntimeConfiguration } from "@/lib/auth-runtime";
import { hasRecentAuthentication } from "@/lib/recent-auth";

export async function GET(request: Request) {
  const configuration = authenticationRuntimeConfiguration();
  const primaryProvider = configuration.externalIdEnabled
    && configuration.externalIdNewAccountsEnabled
    ? "filosage"
    : "google";
  const user = await getVerifiedUser(request);
  return Response.json({
    recentAuthentication: Boolean(user && hasRecentAuthentication(user.auth_time)),
    authentication: {
      primaryProvider,
      externalIdAvailable: configuration.externalIdEnabled,
      legacyGoogleAvailable: configuration.directGoogleEnabled,
    },
    user: user ? {
      uid: user.uid,
      displayName: user.name ?? null,
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
