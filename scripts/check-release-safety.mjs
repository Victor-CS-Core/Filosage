const targetInput = (process.argv[2] || "").trim();
if (!targetInput) {
  console.error("Provide the deployed revision or slot URL.");
  process.exit(1);
}

let target;
try {
  target = new URL(targetInput);
  if (target.protocol !== "https:" || target.pathname !== "/" || target.search || target.hash) throw new Error();
} catch {
  console.error("Release safety target must be an HTTPS origin without a path, query, or fragment.");
  process.exit(1);
}

const attempts = 12;
let lastFailure = "unknown error";
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const billingResponse = await fetch(new URL("/api/billing/status", target), {
      headers: { "User-Agent": "Filosage-Release-Safety/1.0" },
      signal: controller.signal,
    });
    const billing = await billingResponse.json().catch(() => null);
    if (!billingResponse.ok
      || billing?.enabled !== false
      || billing?.checkoutReady !== false
      || billing?.managementReady !== false
      || billing?.ready !== false) {
      throw new Error("runtime billing lock is not closed");
    }

    const authResponse = await fetch(new URL("/.auth/login/google?post_login_redirect_uri=%2F", target), {
      headers: { "User-Agent": "Filosage-Release-Safety/1.0" },
      redirect: "manual",
      signal: controller.signal,
    });
    const location = authResponse.headers.get("location");
    const redirect = location ? new URL(location) : null;
    if (authResponse.status !== 302
      || redirect?.protocol !== "https:"
      || redirect.hostname !== "accounts.google.com"
      || redirect.pathname !== "/o/oauth2/v2/auth") {
      throw new Error("Google Easy Auth did not issue the expected OAuth redirect");
    }

    console.log("Release safety is healthy (billing closed; Google Easy Auth active).");
    process.exit(0);
  } catch (error) {
    lastFailure = error instanceof Error ? error.message : "unknown error";
  } finally {
    clearTimeout(timeout);
  }
  if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 10_000));
}

console.error(`Release safety check failed after ${attempts} attempts: ${lastFailure}`);
process.exit(1);
