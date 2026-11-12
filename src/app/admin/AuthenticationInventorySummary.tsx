import type { CloudflareInfrastructure } from "@/lib/cloudflare-infrastructure";

export function AuthenticationInventorySummary({
  authentication,
}: {
  authentication: CloudflareInfrastructure["authentication"];
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
