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
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { OWNER_EMAIL } from "@/lib/auth-constants";
import { auth } from "@/lib/firebase";

interface AuthContextValue {
  user: User | null;
  isOwner: boolean;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider.");
  return value;
}

function isMobileBrowser() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function isOwnerAccount(user: User | null) {
  return user?.email?.trim().toLowerCase() === OWNER_EMAIL;
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
      return "Your browser blocked the Google sign-in window. Allow popups for this site and try again.";
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
  const [loading, setLoading] = useState(Boolean(auth));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const firebaseAuth = auth;
    if (!firebaseAuth) {
      return;
    }

    getRedirectResult(firebaseAuth)
      .then(async (result) => {
        if (result?.user && !isOwnerAccount(result.user)) {
          await firebaseSignOut(firebaseAuth);
          setError(`Teach Studio is limited to ${OWNER_EMAIL}.`);
        }
      })
      .catch((redirectError) => setError(authErrorMessage(redirectError)));

    return onAuthStateChanged(firebaseAuth, async (nextUser) => {
      if (nextUser && !isOwnerAccount(nextUser)) {
        await firebaseSignOut(firebaseAuth);
        setUser(null);
        setError(`Teach Studio is limited to ${OWNER_EMAIL}.`);
      } else {
        setUser(nextUser);
      }
      setLoading(false);
    });
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    if (!auth) {
      setError("Google sign-in is not configured in this local environment.");
      throw new Error("Firebase is not configured.");
    }
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: "select_account",
      login_hint: OWNER_EMAIL,
    });

    try {
      if (isMobileBrowser()) {
        await signInWithRedirect(auth, provider);
        return;
      }

      const result = await signInWithPopup(auth, provider);
      if (!isOwnerAccount(result.user)) {
        await firebaseSignOut(auth);
        setError(`Teach Studio is limited to ${OWNER_EMAIL}.`);
        throw new Error("Account not authorized.");
      }
    } catch (popupError) {
      if (
        popupError instanceof Error &&
        popupError.message === "Account not authorized."
      ) {
        throw popupError;
      }
      setError(authErrorMessage(popupError));
      throw popupError;
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    if (!auth) return;
    await firebaseSignOut(auth);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isOwner: isOwnerAccount(user),
      loading,
      error,
      clearError: () => setError(null),
      signInWithGoogle,
      signOut,
    }),
    [user, loading, error, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
