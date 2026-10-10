import { z } from "zod";
import { createMobileAccessToken, isMobileAuthActive, redeemMobileCode } from "@/lib/mobile-auth";
import { enforceDurableRateLimit } from "@/lib/request-rate-limit";
import { providerDisplayName } from "@/lib/display-name";

const tokenRequestSchema = z.object({
  code: z.string().min(16).max(8_192),
  codeVerifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
});

/**
 * Step 4 of native sign-in. Exchanges the one-shot code + PKCE verifier for a
 * 30-day bearer token. Called by the app directly (no browser), so it does not
 * use readJsonBody's same-origin check; PKCE is the proof of possession.
 */
export async function POST(request: Request) {
  if (!isMobileAuthActive()) {
    return Response.json({ error: "App sign-in is not available." }, { status: 503 });
  }
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return Response.json({ error: "Send this request as application/json." }, { status: 415 });
  }
  const limited = await enforceDurableRateLimit(request, "mobile-token", 20, 60_000);
  if (limited) return limited;

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 10_000) return Response.json({ error: "This request is too large." }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = tokenRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid token request." }, { status: 400 });

  const user = await redeemMobileCode(parsed.data.code, parsed.data.codeVerifier);
  if (!user) return Response.json({ error: "This sign-in link expired. Try again." }, { status: 401 });

  const { token, expiresAt } = await createMobileAccessToken(user);
  return Response.json({
    accessToken: token,
    tokenType: "Bearer",
    expiresAt: new Date(expiresAt).toISOString(),
    user: {
      uid: user.uid,
      email: user.email,
      displayName: providerDisplayName(user.name, user.email),
      photoURL: user.picture ?? null,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
