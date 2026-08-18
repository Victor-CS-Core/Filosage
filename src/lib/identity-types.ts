export const DIRECT_GOOGLE_ISSUER = "https://accounts.google.com" as const;

export type IdentityProviderId = "google" | "filosage" | "local";

export interface VerifiedProviderIdentity {
  provider: IdentityProviderId;
  issuer: string;
  subject: string;
  email: string;
  emailVerified: true;
  authTime?: number;
  name?: string;
  picture?: string;
}

export interface VerifiedUser {
  uid: string;
  email: string;
  email_verified: true;
  auth_time?: number;
  name?: string;
  picture?: string;
  providerIdentity: VerifiedProviderIdentity;
  identityLinkRegistered: boolean;
}
