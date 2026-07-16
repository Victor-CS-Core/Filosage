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
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithRedirect,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import type { AccessLevel, LearnerAccount } from "@/lib/course-types";

interface AuthContextValue {
  user: User | null;
  isOwner: boolean;
  isPro: boolean;
  access: AccessLevel;
  account: LearnerAccount | null;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  signInWithGoogle: () => Promise<void>;
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
      return "Your browser blocked the Google sign-in window. Allow popups, or open Erudoza in Safari or Chrome, and try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Google sign-in was canceled. You can try again when ready.";
    case "auth/network-request-failed":
      return "Google sign-in could not reach the network. Check your connection and try again.";
    case "auth/operation-not-allowed":
      return "Google sign-in is currently unavailable for this project.";
    default:
      return "Google sign-in could not be completed. Please try again.";
  }
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
    const token = await nextUser.getIdToken();
    const response = await fetch("/api/account", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Your learning account could not be loaded.");
    setAccount(await response.json() as LearnerAccount);
  }, []);

  useEffect(() => {
    const firebaseAuth = auth;
    if (!firebaseAuth) {
      return;
    }

    const bootTimeout = window.setTimeout(() => setLoading(false), 2500);
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (nextUser) => {
      window.clearTimeout(bootTimeout);
      setUser(nextUser);
      try {
        await loadAccount(nextUser);
      } catch (accountError) {
        setAccount(null);
        setError(accountError instanceof Error ? accountError.message : "Your learning account could not be loaded.");
      }
      setLoading(false);
    });

    return () => {
      window.clearTimeout(bootTimeout);
      unsubscribe();
    };
  }, [loadAccount]);

  useEffect(() => {
    if (!auth) return;
    void getRedirectResult(auth).catch((redirectError) => setError(authErrorMessage(redirectError)));
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    if (!auth) {
      setError("Google sign-in is not configured in this local environment.");
      throw new Error("Firebase is not configured.");
    }
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    try {
      const prefersRedirect = window.matchMedia("(pointer: coarse)").matches || /iPhone|iPad|Android/i.test(navigator.userAgent);
      if (prefersRedirect) {
        await signInWithRedirect(auth, provider);
        return;
      }
      await signInWithPopup(auth, provider);
    } catch (popupError) {
      setError(authErrorMessage(popupError));
      throw popupError;
    }
  }, []);

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
      signOut,
      refreshAccount,
    }),
    [user, account, loading, error, signInWithGoogle, signOut, refreshAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
