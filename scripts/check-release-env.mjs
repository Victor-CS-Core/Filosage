const required = ["NEXT_PUBLIC_SITE_URL", "FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "NEXT_PUBLIC_FIREBASE_APP_ID", "OPENAI_API_KEY", "OWNER_EMAIL"];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) { console.error(`Missing release environment variables: ${missing.join(", ")}`); process.exitCode = 1; }
else console.log("Release environment looks complete. Secret values were not printed.");
