const required = ["NEXT_PUBLIC_SITE_URL", "FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "NEXT_PUBLIC_FIREBASE_APP_ID", "OPENAI_API_KEY", "OWNER_EMAIL", "ACTIVITY_RECEIPT_SECRET"];
const recommendedOperations = ["FIRESTORE_BACKUP_BUCKET", "OPERATIONS_ALERT_WEBHOOK_URL"];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) { console.error(`Missing release environment variables: ${missing.join(", ")}`); process.exitCode = 1; }
else {
  const invalid = [];
  if (process.env.ACTIVITY_RECEIPT_SECRET.trim().length < 32) invalid.push("ACTIVITY_RECEIPT_SECRET must contain at least 32 characters");
  const secureUrls = ["NEXT_PUBLIC_SITE_URL", ...(process.env.OPERATIONS_ALERT_WEBHOOK_URL ? ["OPERATIONS_ALERT_WEBHOOK_URL"] : [])];
  for (const name of secureUrls) {
    try {
      const url = new URL(process.env[name]);
      if (url.protocol !== "https:") invalid.push(`${name} must use HTTPS`);
    } catch {
      invalid.push(`${name} must be a valid URL`);
    }
  }
  if (process.env.FIRESTORE_BACKUP_BUCKET && !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(process.env.FIRESTORE_BACKUP_BUCKET)) {
    invalid.push("FIRESTORE_BACKUP_BUCKET must be a valid bucket name");
  }
  if (invalid.length) {
    for (const issue of invalid) console.error(`Invalid release configuration: ${issue}`);
    process.exitCode = 1;
  } else {
    console.log("Release environment looks complete. Secret values were not printed.");
    const missingOperations = recommendedOperations.filter((name) => !process.env[name]?.trim());
    if (missingOperations.length) {
      console.warn(`Operational readiness warning: configure ${missingOperations.join(", ")} for automated alerts and managed backups.`);
    }
  }
}
