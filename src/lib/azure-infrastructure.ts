import "server-only";

import { isLocalMode } from "@/lib/local-mode";
import { serverEnvironment } from "@/lib/runtime-environment";

export interface AzureInfrastructure {
  generatedAt: string;
  status: "configured" | "incomplete" | "local";
  authentication: { provider: "Microsoft Entra External ID"; measuredAccounts: number; configured: boolean };
  database: { provider: "Azure Database for PostgreSQL"; configured: boolean; serverName?: string; backupRetentionDays: 7 };
  storage: { provider: "Azure Blob Storage"; configured: boolean; container: string };
  hosting: { provider: "Azure Container Apps"; configured: boolean };
  observability: { provider: "Azure Monitor and Log Analytics"; configured: boolean };
  limitations: string[];
}

export function azureInfrastructure(): AzureInfrastructure {
  const local = isLocalMode();
  const authenticationConfigured = Boolean(
    serverEnvironment.NEXT_PUBLIC_ENTRA_CLIENT_ID?.trim()
    && serverEnvironment.NEXT_PUBLIC_ENTRA_AUTHORITY?.trim()
    && serverEnvironment.NEXT_PUBLIC_ENTRA_TENANT_ID?.trim(),
  );
  const databaseConfigured = Boolean(serverEnvironment.DATABASE_URL?.trim());
  const storageConfigured = Boolean(serverEnvironment.AZURE_STORAGE_ACCOUNT_URL?.trim());
  const hostingConfigured = Boolean(serverEnvironment.WEBSITE_HOSTNAME?.trim() || serverEnvironment.CONTAINER_APP_NAME?.trim());
  const observabilityConfigured = Boolean(serverEnvironment.AZURE_RESOURCE_GROUP?.trim());
  const complete = authenticationConfigured && databaseConfigured && storageConfigured;
  return {
    generatedAt: new Date().toISOString(),
    status: local ? "local" : complete ? "configured" : "incomplete",
    authentication: { provider: "Microsoft Entra External ID", measuredAccounts: 0, configured: authenticationConfigured },
    database: {
      provider: "Azure Database for PostgreSQL",
      configured: databaseConfigured,
      serverName: serverEnvironment.AZURE_POSTGRES_SERVER_NAME?.trim(),
      backupRetentionDays: 7,
    },
    storage: {
      provider: "Azure Blob Storage",
      configured: storageConfigured,
      container: serverEnvironment.AZURE_STORAGE_BANNER_CONTAINER?.trim() || "course-banners",
    },
    hosting: { provider: "Azure Container Apps", configured: hostingConfigured },
    observability: { provider: "Azure Monitor and Log Analytics", configured: observabilityConfigured },
    limitations: [
      "This page reports runtime configuration, not invoice-grade Azure cost or capacity metrics.",
      "Use Azure Cost Management and Azure Monitor for measured spend, database load, container revisions, and storage usage.",
      "Backup readiness requires a successful point-in-time restore into a separate recovery server; configuration alone is not recovery proof.",
    ],
  };
}
