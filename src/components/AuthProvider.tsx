"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  beginManagedReauthentication,
  beginManagedSignIn,
  currentEasyAuthState,
  isManagedAuthConfigured,
  readBoundedJsonResponse,
  signOutFromEasyAuth,
  type FilosageUser,
  type ManagedAuthenticationState,
} from "@/lib/identity-client";
import type { AccessLevel, LearnerAccount } from "@/lib/course-types";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import {
  parsePendingIdentityRecovery,
  parsePendingManagedRedirectAcceptance,
  pendingIdentityRecovery,
  pendingManagedRedirectAcceptance,
  PENDING_IDENTITY_RECOVERY_KEY,
  PENDING_MANAGED_REDIRECT_ACCEPTANCE_KEY,
} from "@/lib/auth-redirect";

interface AuthContextValue {
  user: FilosageUser | null;
  authentication: ManagedAuthenticationState["authentication"];
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
  signIn: () => Promise<FilosageUser>;
  signInWithRedirect: () => Promise<void>;
  useExistingGoogleSignIn: (recoverIdentity?: boolean) => Promise<void>;
  connectExternalIdentity: (returnPath?: string) => Promise<void>;
  reauthenticate: (postLoginPath?: string) => Promise<FilosageUser>;
  acceptLegalTerms: (source: "signup" | "terms-update" | "subscription", targetUser?: FilosageUser) => Promise<void>;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const localAuthAvailable = process.env.NODE_ENV === "development";
const LOCAL_SESSION_KEY = "filosage-local-session";
const MAX_ACCOUNT_RESPONSE_BYTES = 64 * 1024;
const MAX_LINK_RESPONSE_BYTES = 16 * 1024;
const DEFAULT_AUTHENTICATION: ManagedAuthenticationState["authentication"] = {
  primaryProvider: "google",
  externalIdAvailable: false,
  legacyGoogleAvailable: false,
};

function localOwnerUser(): FilosageUser {
  return {
    uid: "local-owner",
    displayName: "Local Owner",
    email: "owner@filosage.local",
    photoURL: null,
    provider: "local",
    getIdToken: async () => "local-dev-token",
    reauthenticationToken: "local-dev-token",
  };
}

function identityLinkRequiredAccount(): LearnerAccount {
  return {
    access: "free",
    plan: "free",
    isOwner: false,
    accountStatus: "active",
    subscriptionStatus: "none",
    capabilities: {
      createCourse: false,
      generateLesson: false,
      flashcardDecksEnabled: false,
      createCustomFlashcardDeck: false,
      publishCourse: false,
      advancedCapstoneAnalysis: false,
      exportEvidenceReport: false,
      shareEvidenceReport: false,
    },
    courseCredits: {
      balance: 0,
      monthlyAllocation: 0,
      balanceCap: 0,
      nextAccrualAt: null,
      frozenUntil: null,
    },
    legalAcceptanceRequired: false,
    applicationAccountExists: false,
    identityLinkRequired: true,
    quotas: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactLinkRequiredError(value: unknown) {
  return isRecord(value)
    && Object.keys(value).sort().join(",") === "code,error"
    && value.code === "identity_link_required"
    && value.error === "This email is already connected to a Filosage learning account. Confirm your existing sign-in to connect the new method.";
}

function hasOnlyDisabledCapabilities(value: unknown) {
  if (!isRecord(value)) return false;
  const expected = [
    "advancedCapstoneAnalysis",
    "createCourse",
    "createCustomFlashcardDeck",
    "exportEvidenceReport",
    "flashcardDecksEnabled",
    "generateLesson",
    "publishCourse",
    "shareEvidenceReport",
  ];
  return Object.keys(value).sort().join(",") === expected.sort().join(",")
    && expected.every((capability) => value[capability] === false);
}

function isZeroCapabilityLinkRequiredAccount(value: unknown) {
  return isRecord(value)
    && value.access === "free"
    && value.plan === "free"
    && value.isOwner === false
    && value.accountStatus === "active"
    && value.applicationAccountExists === false
    && value.legalAcceptanceRequired === false
    && value.identityLinkRequired === true
    && hasOnlyDisabledCapabilities(value.capabilities)
    && Array.isArray(value.quotas)
    && value.quotas.length === 0;
}

function exactIdentityLinkRedirect(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/.auth/login/filosage?")) return null;
  try {
    const parsed = new URL(value, window.location.origin);
    const entries = [...parsed.searchParams.entries()];
    if (parsed.origin !== window.location.origin
      || parsed.pathname !== "/.auth/login/filosage"
      || parsed.hash
      || entries.length !== 1
      || entries[0][0] !== "post_login_redirect_uri"
      || entries[0][1] !== "/auth/complete-link") {
      return null;
    }
    return "/.auth/login/filosage?post_login_redirect_uri=%2Fauth%2Fcomplete-link";
  } catch {
    return null;
  }
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider.");
  return value;
}

function authErrorMessage(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
  if (code === "easy_auth_unavailable") {
    return "Sign-in is temporarily unavailable. Your learning data has not changed. Please try again.";
  }
  return "Sign-in could not be completed. Your learning data has not changed. Please try again.";
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

async function identityLinkRedirect(returnPath: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`/api/auth/link-intent?return=${encodeURIComponent(returnPath)}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const value = await readBoundedJsonResponse(
      response,
      MAX_LINK_RESPONSE_BYTES,
      "The secure connection could not be started.",
    );
    if (response.status === 429) {
      throw new Error("Too many connection attempts. Wait a few minutes, then try again.");
    }
    if (!response.ok || !isRecord(value)) {
      const message = isRecord(value)
        && Object.keys(value).sort().join(",") === "error"
        && typeof value.error === "string"
        && value.error.length <= 300
        ? value.error
        : "The secure connection could not be started.";
      throw new Error(message);
    }
    const keys = Object.keys(value).sort().join(",");
    if (keys !== "redirectTo" && keys !== "expiresAt,redirectTo") {
      throw new Error("The secure connection could not be started.");
    }
    if ("expiresAt" in value
      && (typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt)))) {
      throw new Error("The secure connection could not be started.");
    }
    const redirectTo = exactIdentityLinkRedirect(value.redirectTo);
    if (!redirectTo) throw new Error("The secure connection could not be started.");
    return redirectTo;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        "The secure connection took too long. Check your network and try again.",
        { cause: error },
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function managedProviderAvailable(
  authentication: ManagedAuthenticationState["authentication"],
) {
  return authentication.primaryProvider === "filosage"
    ? authentication.externalIdAvailable
    : authentication.legacyGoogleAvailable;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FilosageUser | null>(null);
  const [authentication, setAuthentication] = useState(DEFAULT_AUTHENTICATION);
  const [account, setAccount] = useState<LearnerAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pendingHintsRef = useRef<{
    acceptance: ReturnType<typeof parsePendingManagedRedirectAcceptance>;
    recovery: ReturnType<typeof parsePendingIdentityRecovery>;
  } | null>(null);

  const loadAccount = useCallback(async (nextUser: FilosageUser | null) => {
    if (!nextUser) {
      setAccount(null);
      return null;
    }
    const token = await withTimeout(
      nextUser.getIdToken(),
      6_000,
      "Your session is taking longer than expected. You can keep learning while it reconnects.",
    );
    const controller = new AbortController();
    const requestTimeout = window.setTimeout(() => controller.abort(), 8_000);
    let response: Response;
    try {
      response = await fetch("/api/account", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
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
    const body = await readBoundedJsonResponse(
      response,
      MAX_ACCOUNT_RESPONSE_BYTES,
      "Your learning account could not be loaded.",
    );
    if ((response.ok || response.status === 409) && isZeroCapabilityLinkRequiredAccount(body)) {
      const linked = identityLinkRequiredAccount();
      setAccount(linked);
      return linked;
    }
    if (response.status === 409 && exactLinkRequiredError(body)) {
      const linked = identityLinkRequiredAccount();
      setAccount(linked);
      return linked;
    }
    if (!response.ok || !isRecord(body)) throw new Error("Your learning account could not be loaded.");
    const nextAccount = body as unknown as LearnerAccount;
    setAccount(nextAccount);
    return nextAccount;
  }, []);

  useEffect(() => {
    if (pendingHintsRef.current === null) {
      const storedAcceptance = sessionStorage.getItem(PENDING_MANAGED_REDIRECT_ACCEPTANCE_KEY);
      const storedRecovery = sessionStorage.getItem(PENDING_IDENTITY_RECOVERY_KEY);
      pendingHintsRef.current = {
        acceptance: parsePendingManagedRedirectAcceptance(storedAcceptance),
        recovery: parsePendingIdentityRecovery(storedRecovery),
      };
      if (storedAcceptance) sessionStorage.removeItem(PENDING_MANAGED_REDIRECT_ACCEPTANCE_KEY);
      if (storedRecovery) sessionStorage.removeItem(PENDING_IDENTITY_RECOVERY_KEY);
    }

    if (localAuthAvailable && localStorage.getItem(LOCAL_SESSION_KEY)) {
      const restored = localOwnerUser();
      void Promise.resolve().then(async () => {
        setUser(restored);
        try {
          await loadAccount(restored);
        } catch (accountError) {
          setError(accountError instanceof Error ? accountError.message : "Your learning account could not be loaded.");
        } finally {
          setLoading(false);
        }
      });
      return;
    }

    let cancelled = false;
    const bootTimeout = window.setTimeout(() => {
      if (!cancelled) {
        setError("Your session is taking longer than expected. Refresh to try again.");
        setLoading(false);
      }
    }, 10_000);
    void currentEasyAuthState().then(async (state) => {
      if (cancelled) return;
      setAuthentication(state.authentication);
      setUser(state.user);
      if (!state.user) {
        setAccount(null);
        return;
      }
      const restoredAccount = await loadAccount(state.user);
      if (!cancelled) setLoading(false);
      const pendingRecovery = pendingHintsRef.current?.recovery;
      if (cancelled || (restoredAccount?.identityLinkRequired
        && !(state.user.provider === "google" && pendingRecovery))) return;

      if (state.user.provider === "google" && pendingRecovery) {
        try {
          window.location.assign(await identityLinkRedirect(pendingRecovery.returnPath));
        } catch (recoveryError) {
          if (!cancelled) {
            setError(recoveryError instanceof Error
              ? recoveryError.message
              : "The secure connection could not be started.");
          }
        }
        return;
      }
      const pendingAcceptance = pendingHintsRef.current?.acceptance;
      if (pendingAcceptance) {
        await persistLegalAcceptance(state.user, pendingAcceptance.source);
        await loadAccount(state.user);
      }
    }).catch((accountError: unknown) => {
      if (!cancelled) {
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

  const signIn = useCallback(async () => {
    setError(null);
    if (!isManagedAuthConfigured) {
      if (localAuthAvailable) {
        const localUser = localOwnerUser();
        localStorage.setItem(LOCAL_SESSION_KEY, "1");
        setUser(localUser);
        await loadAccount(localUser).catch(() => undefined);
        return localUser;
      }
      const unavailable = new Error("Managed authentication is not configured.");
      setError("Secure sign-in is not available in this build.");
      throw unavailable;
    }
    if (!managedProviderAvailable(authentication)) {
      const unavailable = new Error("The selected managed provider is unavailable.");
      setError("Secure sign-in is temporarily unavailable.");
      throw unavailable;
    }
    try {
      return await beginManagedSignIn(
        authentication.primaryProvider,
        `${window.location.pathname}${window.location.search}`,
      );
    } catch (signInError) {
      setError(authErrorMessage(signInError));
      throw signInError;
    }
  }, [authentication, loadAccount]);

  const signInWithRedirect = useCallback(async () => {
    setError(null);
    if (!isManagedAuthConfigured) {
      if (localAuthAvailable) {
        const localUser = localOwnerUser();
        localStorage.setItem(LOCAL_SESSION_KEY, "1");
        setUser(localUser);
        await persistLegalAcceptance(localUser, "signup");
        await loadAccount(localUser).catch(() => undefined);
        return;
      }
      setError("Secure sign-in is not available in this build.");
      throw new Error("Managed authentication is not configured.");
    }
    if (!managedProviderAvailable(authentication)) {
      setError("Secure sign-in is temporarily unavailable.");
      throw new Error("The selected managed provider is unavailable.");
    }
    try {
      sessionStorage.setItem(
        PENDING_MANAGED_REDIRECT_ACCEPTANCE_KEY,
        JSON.stringify(pendingManagedRedirectAcceptance()),
      );
      await beginManagedSignIn(
        authentication.primaryProvider,
        `${window.location.pathname}${window.location.search}`,
      );
    } catch (redirectError) {
      sessionStorage.removeItem(PENDING_MANAGED_REDIRECT_ACCEPTANCE_KEY);
      setError(authErrorMessage(redirectError));
      throw redirectError;
    }
  }, [authentication, loadAccount]);

  const useExistingGoogleSignIn = useCallback(async (recoverIdentity = false) => {
    setError(null);
    if (!authentication.legacyGoogleAvailable) {
      const message = "The existing Google sign-in is not available. Sign out and choose another method.";
      setError(message);
      throw new Error(message);
    }
    if (recoverIdentity) {
      sessionStorage.setItem(
        PENDING_IDENTITY_RECOVERY_KEY,
        JSON.stringify(pendingIdentityRecovery()),
      );
    }
    try {
      await beginManagedSignIn(
        "google",
        `${window.location.pathname}${window.location.search}`,
      );
    } catch (signInError) {
      if (recoverIdentity) sessionStorage.removeItem(PENDING_IDENTITY_RECOVERY_KEY);
      setError(authErrorMessage(signInError));
      throw signInError;
    }
  }, [authentication.legacyGoogleAvailable]);

  const connectExternalIdentity = useCallback(async (returnPath = "/profile?identity-linked=1") => {
    setError(null);
    if (!authentication.externalIdAvailable) {
      const message = "Email-code sign-in is not available yet.";
      setError(message);
      throw new Error(message);
    }
    try {
      window.location.assign(await identityLinkRedirect(returnPath));
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "The secure connection could not be started.");
      throw linkError;
    }
  }, [authentication.externalIdAvailable]);

  const acceptLegalTerms = useCallback(async (
    source: "signup" | "terms-update" | "subscription",
    targetUser?: FilosageUser,
  ) => {
    const activeUser = targetUser ?? user;
    if (!activeUser) throw new Error("Sign in before accepting the terms.");
    if (account?.identityLinkRequired) {
      throw new Error("Confirm your existing sign-in before creating an account.");
    }
    await persistLegalAcceptance(activeUser, source);
    setError(null);
    await loadAccount(activeUser);
  }, [account?.identityLinkRequired, loadAccount, user]);

  const signOut = useCallback(async () => {
    setError(null);
    sessionStorage.removeItem(PENDING_MANAGED_REDIRECT_ACCEPTANCE_KEY);
    sessionStorage.removeItem(PENDING_IDENTITY_RECOVERY_KEY);
    if (localAuthAvailable && localStorage.getItem(LOCAL_SESSION_KEY)) {
      localStorage.removeItem(LOCAL_SESSION_KEY);
      setUser(null);
      setAccount(null);
      return;
    }
    if (!isManagedAuthConfigured && !user) return;
    await signOutFromEasyAuth("/");
  }, [user]);

  const reauthenticate = useCallback(async (postLoginPath = "/privacy-center") => {
    if (localAuthAvailable && localStorage.getItem(LOCAL_SESSION_KEY)) return localOwnerUser();
    if (!user || user.provider === "local") throw new Error("Sign in before confirming this action.");
    const nextUser = await beginManagedReauthentication(user.provider, user.uid, postLoginPath);
    setUser(nextUser);
    return nextUser;
  }, [user]);

  const refreshAccount = useCallback(async () => {
    await loadAccount(user);
  }, [loadAccount, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      authentication,
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
      signIn,
      signInWithRedirect,
      useExistingGoogleSignIn,
      connectExternalIdentity,
      reauthenticate,
      acceptLegalTerms,
      signOut,
      refreshAccount,
    }),
    [
      user,
      authentication,
      account,
      loading,
      error,
      signIn,
      signInWithRedirect,
      useExistingGoogleSignIn,
      connectExternalIdentity,
      reauthenticate,
      acceptLegalTerms,
      signOut,
      refreshAccount,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
