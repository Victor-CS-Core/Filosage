const activationMode = process.argv.includes("--billing-activation");
const required = ["NEXT_PUBLIC_SITE_URL", "DATABASE_URL", "AZURE_EASY_AUTH_ENABLED", "AZURE_STORAGE_ACCOUNT_URL", "AZURE_STORAGE_BANNER_CONTAINER", "AZURE_POSTGRES_SERVER_NAME", "AZURE_RESOURCE_GROUP", "OPENAI_API_KEY", "OWNER_EMAIL", "MIGRATED_OWNER_UID", "ACTIVITY_RECEIPT_SECRET", "IDENTITY_LINK_HMAC_SECRET", "DIRECT_GOOGLE_AUTH_ENABLED", "EXTERNAL_ID_AUTH_ENABLED", "EXTERNAL_ID_NEW_ACCOUNTS_ENABLED", "BILLING_ENABLED", "OPERATIONS_ALERT_WEBHOOK_URL", "OPERATIONS_ALERT_WEBHOOK_SECRET", "SITE_VERSION"];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) { console.error(`Missing release environment variables: ${missing.join(", ")}`); process.exitCode = 1; }
else {
  const invalid = [];
  const enabled = (name) => process.env[name]?.trim() === "true";
  const directGoogleEnabled = enabled("DIRECT_GOOGLE_AUTH_ENABLED");
  const externalIdEnabled = enabled("EXTERNAL_ID_AUTH_ENABLED");
  const externalIdNewAccountsEnabled = enabled("EXTERNAL_ID_NEW_ACCOUNTS_ENABLED");
  for (const name of ["AZURE_EASY_AUTH_ENABLED", "DIRECT_GOOGLE_AUTH_ENABLED", "EXTERNAL_ID_AUTH_ENABLED", "EXTERNAL_ID_NEW_ACCOUNTS_ENABLED", "BILLING_ENABLED"]) {
    if (!/^(?:true|false)$/.test(process.env[name]?.trim() ?? "")) invalid.push(`${name} must be exactly true or false`);
  }
  if (!directGoogleEnabled && !externalIdEnabled) invalid.push("At least one production authentication provider must be enabled");
  if (externalIdNewAccountsEnabled && !externalIdEnabled) invalid.push("EXTERNAL_ID_NEW_ACCOUNTS_ENABLED requires EXTERNAL_ID_AUTH_ENABLED");
  if ((process.env.IDENTITY_LINK_HMAC_SECRET?.trim().length ?? 0) < 32) invalid.push("IDENTITY_LINK_HMAC_SECRET must contain at least 32 characters");
  if (externalIdEnabled) {
    for (const name of ["EXTERNAL_ID_CLIENT_ID", "EXTERNAL_ID_ISSUER", "EXTERNAL_ID_WELL_KNOWN_CONFIGURATION"]) {
      if (!process.env[name]?.trim()) invalid.push(`${name} is required when External ID is enabled`);
    }
    for (const name of ["EXTERNAL_ID_ISSUER", "EXTERNAL_ID_WELL_KNOWN_CONFIGURATION"]) {
      try {
        const url = new URL(process.env[name]);
        if (url.protocol !== "https:") invalid.push(`${name} must use HTTPS`);
      } catch {
        invalid.push(`${name} must be a valid HTTPS URL`);
      }
    }
  }
  if (process.env.ACTIVITY_RECEIPT_SECRET.trim().length < 32) invalid.push("ACTIVITY_RECEIPT_SECRET must contain at least 32 characters");
  if (!/^[a-f0-9]{40}$/i.test(process.env.SITE_VERSION.trim())) invalid.push("SITE_VERSION must be the full 40-character Git commit SHA");
  if (process.env.AZURE_EASY_AUTH_ENABLED.trim().toLowerCase() !== "true") invalid.push("AZURE_EASY_AUTH_ENABLED must be true for production releases");
  if (!/^https:\/\/[a-z0-9-]+\.blob\.core\.windows\.net\/?$/i.test(process.env.AZURE_STORAGE_ACCOUNT_URL.trim())) invalid.push("AZURE_STORAGE_ACCOUNT_URL must be an Azure Blob service URL");
  if (activationMode) {
    const paidRequired = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PLUS_MONTHLY_PRICE_ID", "STRIPE_PLUS_ANNUAL_PRICE_ID", "STRIPE_PRO_MONTHLY_PRICE_ID", "STRIPE_PRO_ANNUAL_PRICE_ID", "LEGAL_OPERATOR_NAME", "LEGAL_BUSINESS_ADDRESS", "GOVERNING_JURISDICTION", "SUPPORT_EMAIL"];
    for (const name of paidRequired) {
      if (!process.env[name]?.trim()) invalid.push(`${name} is required for billing activation`);
    }
    if (process.env.BILLING_ENABLED?.trim().toLowerCase() !== "true") {
      invalid.push("BILLING_ENABLED must be true for an explicitly authorized billing activation check");
    }
    if (process.env.BILLING_PROVIDER?.trim().toLowerCase() !== "stripe") {
      invalid.push("BILLING_PROVIDER must be stripe for billing activation");
    }
    if (process.env.SUPPORT_EMAIL?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.SUPPORT_EMAIL.trim())) {
      invalid.push("SUPPORT_EMAIL must be a valid email address");
    }
    const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
    if (!/^(?:sk|rk)_live_[A-Za-z0-9]{16,}$/.test(stripeSecret)) {
      invalid.push("STRIPE_SECRET_KEY must be a non-placeholder Live secret or restricted key");
    }
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
    if (!/^whsec_[A-Za-z0-9]{16,}$/.test(webhookSecret)) {
      invalid.push("STRIPE_WEBHOOK_SECRET must be a non-placeholder whsec_ signing secret");
    }
    const priceNames = ["STRIPE_PLUS_MONTHLY_PRICE_ID", "STRIPE_PLUS_ANNUAL_PRICE_ID", "STRIPE_PRO_MONTHLY_PRICE_ID", "STRIPE_PRO_ANNUAL_PRICE_ID"];
    const priceIds = priceNames.map((name) => process.env[name]?.trim() ?? "");
    for (const [index, priceId] of priceIds.entries()) {
      if (!/^price_[A-Za-z0-9]{8,}$/.test(priceId)) invalid.push(`${priceNames[index]} must be a valid Stripe Price ID`);
    }
    if (new Set(priceIds).size !== priceIds.length) {
      invalid.push("All four current Stripe Price IDs must be unique");
    }
  } else if (process.env.BILLING_ENABLED?.trim().toLowerCase() !== "false") {
    invalid.push("BILLING_ENABLED must be explicitly false for a closed-billing release");
  }
  const secureUrls = ["NEXT_PUBLIC_SITE_URL", ...(process.env.OPERATIONS_ALERT_WEBHOOK_URL ? ["OPERATIONS_ALERT_WEBHOOK_URL"] : [])];
  for (const name of secureUrls) {
    try {
      const url = new URL(process.env[name]);
      if (url.protocol !== "https:") invalid.push(`${name} must use HTTPS`);
    } catch {
      invalid.push(`${name} must be a valid URL`);
    }
  }
  if (invalid.length) {
    for (const issue of invalid) console.error(`Invalid release configuration: ${issue}`);
    process.exitCode = 1;
  } else {
    console.log(`${activationMode ? "Billing-activation" : "Closed-billing release"} environment looks complete. Secret values were not printed.`);
  }
}
