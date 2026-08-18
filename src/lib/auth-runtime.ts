import { DIRECT_GOOGLE_ISSUER } from "@/lib/identity-types";
import { serverEnvironment } from "@/lib/runtime-environment";

export { DIRECT_GOOGLE_ISSUER } from "@/lib/identity-types";
export const EXTERNAL_ID_PROVIDER_NAME = "filosage";

export interface AuthenticationRuntimeConfiguration {
  easyAuthEnabled: boolean;
  directGoogleEnabled: boolean;
  externalIdEnabled: boolean;
  externalIdNewAccountsEnabled: boolean;
  externalIdIssuer: string | null;
  directGoogleIssuer: typeof DIRECT_GOOGLE_ISSUER;
}

function booleanSetting(value: string | undefined, fallback: boolean) {
  if (value === undefined || value.trim() === "") return fallback;
  return value.trim().toLowerCase() === "true";
}

export function authenticationRuntimeConfiguration(
  env: Record<string, string | undefined> = serverEnvironment,
): AuthenticationRuntimeConfiguration {
  return {
    easyAuthEnabled: booleanSetting(env.AZURE_EASY_AUTH_ENABLED, false),
    directGoogleEnabled: booleanSetting(env.DIRECT_GOOGLE_AUTH_ENABLED, true),
    externalIdEnabled: booleanSetting(env.EXTERNAL_ID_AUTH_ENABLED, false),
    externalIdNewAccountsEnabled: booleanSetting(env.EXTERNAL_ID_NEW_ACCOUNTS_ENABLED, false),
    externalIdIssuer: env.EXTERNAL_ID_ISSUER?.trim().replace(/\/$/, "") || null,
    directGoogleIssuer: DIRECT_GOOGLE_ISSUER,
  };
}

export function authenticationConfigurationIssues(config: AuthenticationRuntimeConfiguration) {
  const issues: string[] = [];
  if (config.easyAuthEnabled && !config.directGoogleEnabled && !config.externalIdEnabled) {
    issues.push("At least one production authentication provider must be enabled.");
  }
  if (config.externalIdEnabled && !config.externalIdIssuer) {
    issues.push("EXTERNAL_ID_ISSUER is required when EXTERNAL_ID_AUTH_ENABLED is true.");
  }
  if (config.externalIdNewAccountsEnabled && !config.externalIdEnabled) {
    issues.push("EXTERNAL_ID_NEW_ACCOUNTS_ENABLED requires EXTERNAL_ID_AUTH_ENABLED.");
  }
  return issues;
}
