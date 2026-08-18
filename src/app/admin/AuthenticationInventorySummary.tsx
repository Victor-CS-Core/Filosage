import type { AzureInfrastructure } from "@/lib/azure-infrastructure";

export function AuthenticationInventorySummary({
  authentication,
}: {
  authentication: AzureInfrastructure["authentication"];
}) {
  return (
    <article>
      <span>Identity</span>
      <strong>{authentication.configured ? "Ready" : "Missing"}</strong>
      <small>Mode: {authentication.mode}</small>
    </article>
  );
}
