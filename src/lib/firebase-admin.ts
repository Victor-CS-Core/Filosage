import { cert, getApps, initializeApp, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let adminApp: App;

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0];

  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (!privateKey || !clientEmail || !projectId) {
    throw new Error(
      "Firebase Admin env vars not set. Add FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY to .env.local"
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      // The private key comes through env as a string with literal \n — replace them
      privateKey: privateKey.replace(/\\n/g, "\n"),
    }),
  });
}

adminApp = getAdminApp();

export const adminAuth = getAuth(adminApp);
export const adminDb   = getFirestore(adminApp);
