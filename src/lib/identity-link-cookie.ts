export const IDENTITY_LINK_INTENT_COOKIE = "filosage_identity_link_intent";
export const IDENTITY_LINK_COMPLETE_PATH = "/api/auth/link-intent/complete";

export function identityLinkCookieAttributes(nodeEnvironment: string | undefined) {
  return {
    httpOnly: true,
    secure: nodeEnvironment === "production",
    sameSite: "lax" as const,
    path: IDENTITY_LINK_COMPLETE_PATH,
  };
}
