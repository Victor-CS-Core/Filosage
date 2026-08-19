import type { AzureInfrastructure } from "@/lib/azure-infrastructure";

export function AuthenticationInventorySummary({
  authentication,
}: {
  authentication: AzureInfrastructure["authentication"];
}) {
  const ready = authentication.configured && authentication.mode !== "unavailable";
  return (
    <article>
      <span>Identity</span>
      <strong>{ready ? "Ready" : "Missing"}</strong>
      <small>Mode: {authentication.mode}</small>
    </article>
  );
}
