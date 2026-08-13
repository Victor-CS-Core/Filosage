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
  beginGoogleReauthentication,
  beginGoogleSignIn,
  currentEasyAuthUser,
  isGoogleAuthConfigured,
  signOutFromEasyAuth,
  type FilosageUser,
} from "@/lib/identity-client";
import type { AccessLevel, LearnerAccount } from "@/lib/course-types";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import {
  parsePendingGoogleRedirectAcceptance,
  pendingGoogleRedirectAcceptance,
  PENDING_GOOGLE_REDIRECT_ACCEPTANCE_KEY,
} from "@/lib/auth-redirect";

interface AuthContextValue {
  user: FilosageUser | null;
  isOwner: boolean;
  isPro: boolean;
  isPaid: boolean;
  canCreateCourses: boolean;
  canGenerateLessons: boolean;
  canPublishCourses: boolean;
  access: AccessLevel;
  account: LearnerAccount | null;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  signInWithGoogle: () => Promise<FilosageUser>;
  signInWithGoogleRedirect: () => Promise<void>;
  reauthenticate: () => Promise<FilosageUser>;
  acceptLegalTerms: (source: "signup" | "terms-update" | "subscription", targetUser?: FilosageUser) => Promise<void>;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Development-only sign-in: the server pairs it with its local owner account
// so every feature remains testable without cloud identity configuration in a
// developer environment. NODE_ENV is inlined at build time, so
// this path cannot exist in production.
const localAuthAvailable = process.env.NODE_ENV === "development";
const LOCAL_SESSION_KEY = "filosage-local-session";

function localOwnerUser(): FilosageUser {
  return {
    uid: "local-owner",
    displayName: "Local Owner",
    email: "owner@filosage.local",
    photoURL: null,
    getIdToken: async () => "local-dev-token",
    reauthenticationToken: "local-dev-token",
  };
}

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
    case "easy_auth_unavailable":
      return "Google sign-in is temporarily unavailable. Please try again.";
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

async function persistLegalAcceptance(
  activeUser: FilosageUser,
  source: "signup" | "terms-update" | "subscription",
) {
  const token = await activeUser.getIdToken();
  const response = await fetch("/api/legal/acceptance", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      ageEligibilityConfirmed: true,
      source,
    }),
  });
  if (!response.ok) throw new Error("Your acceptance could not be saved. Please try again.");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FilosageUser | null>(null);
  const [account, setAccount] = useState<LearnerAccount | null>(null);
  const [loading, setLoading] = useState(isGoogleAuthConfigured);
  const [error, setError] = useState<string | null>(null);

  const loadAccount = useCallback(async (nextUser: FilosageUser | null) => {
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
        throw new Error(
          "Your account is taking longer than expected. You can keep learning while it reconnects.",
          { cause: requestError },
        );
      }
      throw requestError;
    } finally {
      window.clearTimeout(requestTimeout);
    }
    if (!response.ok) throw new Error("Your learning account could not be loaded.");
    setAccount(await response.json() as LearnerAccount);
  }, []);

  useEffect(() => {
    if (localAuthAvailable && localStorage.getItem(LOCAL_SESSION_KEY)) {
      const restored = localOwnerUser();
      void Promise.resolve().then(async () => {
        setUser(restored);
        try {
          await loadAccount(restored);
        } catch (accountError) {
          setAccount(null);
          setError(accountError instanceof Error ? accountError.message : "Your learning account could not be loaded.");
        } finally {
          setLoading(false);
        }
      });
      return;
    }
    if (!isGoogleAuthConfigured) {
      return;
    }

    let cancelled = false;
    const bootTimeout = window.setTimeout(() => {
      setError("Your session is taking longer than expected. Refresh to try again.");
      setLoading(false);
    }, 10000);
    void currentEasyAuthUser().then(async (nextUser) => {
      if (cancelled) return;
      window.clearTimeout(bootTimeout);
      setUser(nextUser);
      setLoading(true);
      if (nextUser) {
        const storedPending = sessionStorage.getItem(PENDING_GOOGLE_REDIRECT_ACCEPTANCE_KEY);
        const pending = parsePendingGoogleRedirectAcceptance(storedPending);
        if (pending) {
          await persistLegalAcceptance(nextUser, pending.source);
          sessionStorage.removeItem(PENDING_GOOGLE_REDIRECT_ACCEPTANCE_KEY);
        } else if (storedPending) {
          sessionStorage.removeItem(PENDING_GOOGLE_REDIRECT_ACCEPTANCE_KEY);
        }
      }
      await loadAccount(nextUser);
    }).catch((accountError: unknown) => {
      if (!cancelled) {
        setAccount(null);
        setError(accountError instanceof Error ? accountError.message : "Your learning account could not be loaded.");
      }
    }).finally(() => {
      window.clearTimeout(bootTimeout);
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(bootTimeout);
    };
  }, [loadAccount]);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    if (!isGoogleAuthConfigured) {
      if (localAuthAvailable) {
        const localUser = localOwnerUser();
        localStorage.setItem(LOCAL_SESSION_KEY, "1");
        setUser(localUser);
        await loadAccount(localUser).catch(() => setAccount(null));
        return localUser;
      }
      setError("Google sign-in is not available in this local build.");
      throw new Error("Google authentication is not configured.");
    }

    try {
      return await beginGoogleSignIn(`${window.location.pathname}${window.location.search}`);
    } catch (signInError) {
      setError(authErrorMessage(signInError));
      throw signInError;
    }
  }, [loadAccount]);

  const signInWithGoogleRedirect = useCallback(async () => {
    setError(null);
    if (!isGoogleAuthConfigured) {
      if (localAuthAvailable) {
        const localUser = localOwnerUser();
        localStorage.setItem(LOCAL_SESSION_KEY, "1");
        setUser(localUser);
        await persistLegalAcceptance(localUser, "signup");
        await loadAccount(localUser).catch(() => setAccount(null));
        return;
      }
      setError("Google sign-in is not available in this local build.");
      throw new Error("Google authentication is not configured.");
    }
    try {
      sessionStorage.setItem(
        PENDING_GOOGLE_REDIRECT_ACCEPTANCE_KEY,
        JSON.stringify(pendingGoogleRedirectAcceptance()),
      );
      await beginGoogleSignIn(`${window.location.pathname}${window.location.search}`);
    } catch (redirectError) {
      sessionStorage.removeItem(PENDING_GOOGLE_REDIRECT_ACCEPTANCE_KEY);
      setError(authErrorMessage(redirectError));
      throw redirectError;
    }
  }, [loadAccount]);

  const acceptLegalTerms = useCallback(async (
    source: "signup" | "terms-update" | "subscription",
    targetUser?: FilosageUser,
  ) => {
    const activeUser = targetUser ?? user;
    if (!activeUser) throw new Error("Sign in before accepting the terms.");
    await persistLegalAcceptance(activeUser, source);
    setError(null);
    await loadAccount(activeUser);
  }, [loadAccount, user]);

  const signOut = useCallback(async () => {
    setError(null);
    if (localAuthAvailable && localStorage.getItem(LOCAL_SESSION_KEY)) {
      localStorage.removeItem(LOCAL_SESSION_KEY);
      setUser(null);
      setAccount(null);
      return;
    }
    if (!isGoogleAuthConfigured) {
      return;
    }
    await signOutFromEasyAuth("/");
  }, []);

  const reauthenticate = useCallback(async () => {
    if (localAuthAvailable && localStorage.getItem(LOCAL_SESSION_KEY)) return localOwnerUser();
    const nextUser = await beginGoogleReauthentication("/privacy-center");
    setUser(nextUser);
    return nextUser;
  }, []);

  const refreshAccount = useCallback(async () => {
    await loadAccount(user);
  }, [loadAccount, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isOwner: account?.isOwner === true,
      isPro: account?.plan === "pro" && account.accountStatus !== "suspended",
      isPaid: (account?.plan === "plus" || account?.plan === "pro") && account.accountStatus !== "suspended",
      canCreateCourses: account?.capabilities?.createCourse ?? Boolean(account?.isOwner || account?.plan === "plus" || account?.plan === "pro"),
      canGenerateLessons: account?.capabilities?.generateLesson ?? Boolean(account?.isOwner || account?.plan === "plus" || account?.plan === "pro"),
      canPublishCourses: account?.capabilities?.publishCourse ?? Boolean(account?.isOwner || account?.plan === "pro"),
      access: account?.access ?? (user ? "free" : "anonymous"),
      account,
      loading,
      error,
      clearError: () => setError(null),
      signInWithGoogle,
      signInWithGoogleRedirect,
      reauthenticate,
      acceptLegalTerms,
      signOut,
      refreshAccount,
    }),
    [user, account, loading, error, signInWithGoogle, signInWithGoogleRedirect, reauthenticate, acceptLegalTerms, signOut, refreshAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
