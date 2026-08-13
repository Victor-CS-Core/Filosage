import { getVerifiedUser } from "@/lib/auth-server";
import { hasRecentAuthentication } from "@/lib/recent-auth";

export async function GET(request: Request) {
  const user = await getVerifiedUser(request);
  return Response.json({
    recentAuthentication: Boolean(user && hasRecentAuthentication(user.auth_time)),
    user: user ? {
      uid: user.uid,
      displayName: user.name ?? null,
      email: user.email ?? null,
      photoURL: user.picture ?? null,
    } : null,
  }, {
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
    },
  });
}
