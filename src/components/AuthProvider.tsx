"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import type { AccessLevel, LearnerAccount } from "@/lib/course-types";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";

interface AuthContextValue {
  user: User | null;
  isOwner: boolean;
  isPro: boolean;
  access: AccessLevel;
  account: LearnerAccount | null;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  signInWithGoogle: () => Promise<User>;
  acceptLegalTerms: (source: "signup" | "terms-update" | "subscription", targetUser?: User) => Promise<void>;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider.");
  return value;
}

function authErrorMessage(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";

  switch (code) {
    case "auth/unauthorized-domain":
      return "Google sign-in is not authorized for this site. Please contact the site owner.";
    case "auth/popup-blocked":
      return "Your browser blocked the Google sign-in window. Allow popups for Erudoza and try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Google sign-in was canceled. You can try again when ready.";
    case "auth/network-request-failed":
      return "Google sign-in could not reach the network. Check your connection and try again.";
    case "auth/operation-not-allowed":
      return "Google sign-in is currently unavailable.";
    case "auth/web-storage-unsupported":
    case "auth/operation-not-supported-in-this-environment":
      return "Google sign-in needs browser storage. Turn off Private Browsing or allow site storage, then try again.";
    default:
      return "Google sign-in could not be completed. Please try again.";
  }
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), milliseconds);
    promise.then(resolve, reject).finally(() => window.clearTimeout(timer));
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<LearnerAccount | null>(null);
  const [loading, setLoading] = useState(Boolean(auth));
  const [error, setError] = useState<string | null>(null);

  const loadAccount = useCallback(async (nextUser: User | null) => {
    if (!nextUser) {
      setAccount(null);
      return;
    }
    const token = await withTimeout(
      nextUser.getIdToken(),
      6000,
      "Your session is taking longer than expected. You can keep learning while it reconnects.",
    );
    const controller = new AbortController();
    const requestTimeout = window.setTimeout(() => controller.abort(), 8000);
    let response: Response;
    try {
      response = await fetch("/api/account", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (requestError) {
      if (controller.signal.aborted) {
        throw new Error("Your account is taking longer than expected. You can keep learning while it reconnects.");
      }
      throw requestError;
    } finally {
      window.clearTimeout(requestTimeout);
    }
    if (!response.ok) throw new Error("Your learning account could not be loaded.");
    setAccount(await response.json() as LearnerAccount);
  }, []);

  useEffect(() => {
    const firebaseAuth = auth;
    if (!firebaseAuth) {
      return;
    }

    const bootTimeout = window.setTimeout(() => setLoading(false), 2500);
    const unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
      window.clearTimeout(bootTimeout);
      setUser(nextUser);
      setLoading(false);
      void loadAccount(nextUser).catch((accountError: unknown) => {
        setAccount(null);
        setError(accountError instanceof Error ? accountError.message : "Your learning account could not be loaded.");
      });
    });

    return () => {
      window.clearTimeout(bootTimeout);
      unsubscribe();
    };
  }, [loadAccount]);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    if (!auth) {
      setError("Google sign-in is not available in this local build.");
      throw new Error("Firebase is not configured.");
    }
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    try {
      const credential = await signInWithPopup(auth, provider);
      return credential.user;
    } catch (popupError) {
      setError(authErrorMessage(popupError));
      throw popupError;
    }
  }, []);

  const acceptLegalTerms = useCallback(async (
    source: "signup" | "terms-update" | "subscription",
    targetUser?: User,
  ) => {
    const activeUser = targetUser ?? user;
    if (!activeUser) throw new Error("Sign in before accepting the terms.");
    const token = await activeUser.getIdToken();
    const response = await fetch("/api/legal/acceptance", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, source }),
    });
    if (!response.ok) throw new Error("Your acceptance could not be saved. Please try again.");
    await loadAccount(activeUser);
  }, [loadAccount, user]);

  const signOut = useCallback(async () => {
    setError(null);
    if (!auth) return;
    await firebaseSignOut(auth);
    setAccount(null);
  }, []);

  const refreshAccount = useCallback(async () => {
    await loadAccount(user);
  }, [loadAccount, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isOwner: account?.isOwner === true,
      isPro: account?.plan === "pro",
      access: account?.access ?? (user ? "free" : "anonymous"),
      account,
      loading,
      error,
      clearError: () => setError(null),
      signInWithGoogle,
      acceptLegalTerms,
      signOut,
      refreshAccount,
    }),
    [user, account, loading, error, signInWithGoogle, acceptLegalTerms, signOut, refreshAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
