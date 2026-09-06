// Read-only hosted probes. Real signed-in and destructive-action evidence remains
// a separate approved-account gate; never dump headers or private response bodies.
const origin = process.argv[2];
try {
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.origin !== origin) throw new Error();
  const principal = Buffer.from(JSON.stringify({ auth_typ: "google", name_typ: "name", role_typ: "role", claims: [{ typ: "sub", val: "release-forgery-fixture" }, { typ: "email", val: "release-forgery@example.invalid" }, { typ: "email_verified", val: "true" }] })).toString("base64");
  for (const headers of [{}, { "x-ms-client-principal": principal, "x-ms-client-principal-id": "release-forgery-fixture", "x-ms-client-principal-idp": "google" }]) {
    const response = await fetch(new URL("/api/account", origin), { headers, redirect: "manual", signal: AbortSignal.timeout(15_000) });
    if (response.status !== 401) throw new Error();
    await response.body?.cancel();
  }
  for (const path of ["/api/health/live", "/api/health/startup", "/api/health/ready"]) {
    const response = await fetch(new URL(path, origin), { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    if (response.status !== 200 || !response.headers.get("cache-control")?.includes("no-store")) throw new Error();
    await response.body?.cancel();
  }
  console.log("Read-only BFF anonymity/header-forgery and split probe checks passed.");
} catch { console.error("BFF boundary or probe checks failed; inspect through the approved operator process."); process.exitCode = 1; }
