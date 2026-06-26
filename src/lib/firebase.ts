import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId:     process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

console.log("Firebase API Key loaded:", firebaseConfig.apiKey ? firebaseConfig.apiKey.substring(0, 5) + "..." : "UNDEFINED");

// Prevent re-initialization on hot reload in dev
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);
export default app;
