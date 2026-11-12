import "server-only";

import { isLocalMode } from "@/lib/local-mode";
import { authenticationMode, type AuthenticationMode } from "@/lib/runtime-config";
import { serverEnvironment } from "@/lib/runtime-environment";

export interface CloudflareInfrastructure {
  generatedAt: string;
  status: "configured" | "incomplete" | "local";
  authentication: { provider: "Direct Google OAuth"; mode: AuthenticationMode; configured: boolean };
  database: { provider: "Cloudflare D1"; configured: boolean; binding: "FILOSAGE_D1" };
  storage: { provider: "Cloudflare R2"; configured: boolean; binding: "FILOSAGE_R2" };
  hosting: { provider: "Cloudflare Workers"; configured: boolean };
  observability: { provider: "Cloudflare Workers Logs"; configured: boolean };
  limitations: string[];
}

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

export function cloudflareInfrastructure(): CloudflareInfrastructure {
  const local = isLocalMode();
  const mode = authenticationMode();
  const authenticationConfigured = mode !== "unavailable";
  const databaseConfigured = enabled(serverEnvironment.CLOUDFLARE_D1_ENABLED);
  const storageConfigured = enabled(serverEnvironment.CLOUDFLARE_R2_ENABLED);
  const deploymentEnvironment = serverEnvironment.DEPLOYMENT_ENVIRONMENT?.trim().toLowerCase();
  const hostingConfigured = deploymentEnvironment === "qa" || deploymentEnvironment === "production";
  const complete = authenticationConfigured && databaseConfigured && storageConfigured && hostingConfigured;
  return {
    generatedAt: new Date().toISOString(),
    status: local ? "local" : complete ? "configured" : "incomplete",
    authentication: { provider: "Direct Google OAuth", mode, configured: authenticationConfigured },
    database: { provider: "Cloudflare D1", configured: databaseConfigured, binding: "FILOSAGE_D1" },
    storage: { provider: "Cloudflare R2", configured: storageConfigured, binding: "FILOSAGE_R2" },
    hosting: { provider: "Cloudflare Workers", configured: hostingConfigured },
    observability: { provider: "Cloudflare Workers Logs", configured: hostingConfigured },
    limitations: [
      "This page reports runtime configuration, not invoice-grade Cloudflare cost or capacity metrics.",
      "Use Cloudflare Analytics and account billing for measured Workers, D1, R2, and logging usage.",
      "Recovery readiness requires retained D1 backup evidence and a separately verified restore rehearsal.",
    ],
  };
}