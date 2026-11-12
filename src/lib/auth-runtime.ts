import { DIRECT_GOOGLE_ISSUER } from "@/lib/identity-types";
import { serverEnvironment } from "@/lib/runtime-environment";

export { DIRECT_GOOGLE_ISSUER } from "@/lib/identity-types";

export interface AuthenticationRuntimeConfiguration {
  directGoogleEnabled: boolean;
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
    directGoogleEnabled: booleanSetting(env.DIRECT_GOOGLE_AUTH_ENABLED, true),
    directGoogleIssuer: DIRECT_GOOGLE_ISSUER,
  };
}

export function authenticationConfigurationIssues(config: AuthenticationRuntimeConfiguration) {
  const issues: string[] = [];
  if (!config.directGoogleEnabled) {
    issues.push("DIRECT_GOOGLE_AUTH_ENABLED must be true in production.");
  }
  return issues;
}
