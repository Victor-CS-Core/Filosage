"use client";

import {
  createContext,
  Fragment,
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
  currentAuthenticationState,
  isManagedAuthConfigured,
  readBoundedJsonResponse,
  signOutFromAuthentication,
  type FilosageUser,
  type ManagedAuthenticationState,
} from "@/lib/identity-client";
import type { AccessLevel, LearnerAccount } from "@/lib/course-types";
import { isZeroCapabilityLinkRequiredAccount, parseLearnerAccount } from "@/lib/account-client";
import { safeAuthenticationReturnPath } from "@/lib/auth-return-path";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import {
  parsePendingManagedRedirectAcceptance,
  pendingManagedRedirectAcceptance,
  PENDING_MANAGED_REDIRECT_ACCEPTANCE_KEY,
} from "@/lib/auth-redirect";

import {
  announceLearnerSessionChange, invalidateLearnerSession, isCurrentLearnerSession,
  learnerSessionSnapshot, setLearnerStorageIdentity,
  LEARNER_SESSION_CHANGE_KEY, LEARNER_SESSION_INVALIDATED_EVENT,
} from "@/lib/learner-storage";

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
  sessionResolved: boolean;
  error: string | null;
  clearError: () => void;
  signIn: () => Promise<FilosageUser>;
  signInWithRedirect: (postLoginPath?: string) => Promise<void>;
  reauthenticate: (postLoginPath?: string) => Promise<FilosageUser>;
  acceptLegalTerms: (source: "signup" | "terms-update" | "subscription", targetUser?: FilosageUser) => Promise<void>;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const localAuthAvailable = process.env.NODE_ENV === "development";
const LOCAL_SESSION_KEY = "filosage-local-session";
const MAX_ACCOUNT_RESPONSE_BYTES = 64 * 1024;
const DEFAULT_AUTHENTICATION: ManagedAuthenticationState["authentication"] = {
  primaryProvider: "google",
  googleAvailable: false,
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
    && value.error === "This Google identity conflicts with an existing Filosage account record.";
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider.");
  return value;
}

function authErrorMessage(error: unknown) {
  void error;
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

function managedProviderAvailable(
  authentication: ManagedAuthenticationState["authentication"],
) {
  return authentication.primaryProvider === "google" && authentication.googleAvailable;
}

function boundedAccountError(error: unknown) {
  return error instanceof Error && [
    "Authentication status is unavailable.",
    "Your account is taking longer than expected. You can keep learning while it reconnects.",
    "Your session is taking longer than expected. You can keep learning while it reconnects.",
  ].includes(error.message)
    ? error.message
    : "Your learning account could not be loaded.";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FilosageUser | null>(null);
  const [account, setAccount] = useState<LearnerAccount | null>(null);
  const [sessionRevision, setSessionRevision] = useState(0);
  // The loading watchdog can expire while the canonical session is unresolved.
  const [sessionResolved, setSessionResolved] = useState(false);
  const userRef = useRef<FilosageUser | null>(null);
  const authOperationRef = useRef(0);
  const initialSessionLoadedRef = useRef(false);

  const commitUser = useCallback((nextUser: FilosageUser | null, broadcast = true) => {
    const changed = userRef.current?.uid !== nextUser?.uid
      || userRef.current?.accountGeneration !== nextUser?.accountGeneration;
    setSessionRevision(setLearnerStorageIdentity(nextUser?.uid ?? null, nextUser?.accountGeneration ?? null));
    const session = learnerSessionSnapshot();
    const guardedUser = nextUser ? {
      ...nextUser,
      getIdToken: async (forceRefresh?: boolean) => {
        if (!isCurrentLearnerSession(session)) throw new Error("Your learning session changed. Sign in again to continue.");
        const token = await nextUser.getIdToken(forceRefresh);
        // Managed tokens carry an expected canonical UID. The server compares
        // it with the verified cookie identity at dispatch, closing the race.
        if (!isCurrentLearnerSession(session)) throw new Error("Your learning session changed. Sign in again to continue.");
        return token;
      },
    } : null;
    setSessionResolved(true);
    userRef.current = guardedUser;
    setUser(guardedUser);
    if (changed) setAccount(null);
    if (changed && broadcast) announceLearnerSessionChange(nextUser ? "refresh" : "signed-out");
    return guardedUser;
  }, []);
  const [authentication, setAuthentication] = useState(DEFAULT_AUTHENTICATION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pendingAcceptanceRef = useRef<ReturnType<typeof parsePendingManagedRedirectAcceptance> | null>(null);

  const loadAccount = useCallback(async (nextUser: FilosageUser | null) => {
    const session = learnerSessionSnapshot();
    const isCurrent = () => session.uid === nextUser?.uid && isCurrentLearnerSession(session);
    if (!nextUser) {
      setAccount(null);
      return null;
    }
    const token = await withTimeout(
      nextUser.getIdToken(),
      6_000,
      "Your session is taking longer than expected. You can keep learning while it reconnects.",
    );
    if (!isCurrent()) return null;
    const controller = new AbortController();
    const requestTimeout = window.setTimeout(() => controller.abort(), 8_000);
    let response: Response;
    try {
      response = await fetch("/api/account", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "X-Filosage-Account-Fields": "billing-cancellation" },
        cache: "no-store",
        signal: AbortSignal.any([controller.signal, session.signal]),
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
    if (!isCurrent()) return null;
    if (response.status === 401) { invalidateLearnerSession(); return null; }
    const parsedAccount = parseLearnerAccount(body);
    if ((response.ok || response.status === 409) && parsedAccount && isZeroCapabilityLinkRequiredAccount(parsedAccount)) {
      const linked = identityLinkRequiredAccount();
      setAccount(linked);
      return linked;
    }
    if (response.status === 409 && exactLinkRequiredError(body)) {
      const linked = identityLinkRequiredAccount();
      setAccount(linked);
      return linked;
    }
    if (!response.ok || !parsedAccount) throw new Error("Your learning account could not be loaded.");
    const nextAccount = parsedAccount;
    setAccount(nextAccount);
    return nextAccount;
  }, []);

  useEffect(() => {
    const operation = ++authOperationRef.current;
    if (pendingAcceptanceRef.current === null) {
      const storedAcceptance = sessionStorage.getItem(PENDING_MANAGED_REDIRECT_ACCEPTANCE_KEY);
      pendingAcceptanceRef.current = parsePendingManagedRedirectAcceptance(storedAcceptance);
      if (storedAcceptance) sessionStorage.removeItem(PENDING_MANAGED_REDIRECT_ACCEPTANCE_KEY);
    }

    if (localAuthAvailable && localStorage.getItem(LOCAL_SESSION_KEY)) {
      const restored = localOwnerUser();
      void Promise.resolve().then(async () => {
        if (operation !== authOperationRef.current) return;
        const active = commitUser(restored);
        try {
          await loadAccount(active);
        } catch (accountError) {
          setError(boundedAccountError(accountError));
        } finally {
          if (operation === authOperationRef.current) { initialSessionLoadedRef.current = true; setLoading(false); }
        }
      });
      return;
    }

    let cancelled = false;
    const bootTimeout = window.setTimeout(() => {
      if (!cancelled && operation === authOperationRef.current) {
        initialSessionLoadedRef.current = true;
        setError("Your session is taking longer than expected. Refresh to try again.");
        setLoading(false);
      }
    }, 10_000);
    void currentAuthenticationState().then(async (state) => {
      if (cancelled || operation !== authOperationRef.current) return;
      setAuthentication(state.authentication);
      const active = commitUser(state.user);
      if (!state.user) {
        setAccount(null);
        return;
      }
      const restoredAccount = await loadAccount(active);
      if (cancelled || operation !== authOperationRef.current) return;
      const pendingAcceptance = pendingAcceptanceRef.current;
      const willPersistAcceptance = pendingAcceptance !== null
        && !restoredAccount?.identityLinkRequired;
      if (!willPersistAcceptance && !cancelled) setLoading(false);
      if (cancelled || restoredAccount?.identityLinkRequired) return;
      if (willPersistAcceptance && pendingAcceptance) {
        await persistLegalAcceptance(state.user, pendingAcceptance.source);
        await loadAccount(state.user);
      }
    }).catch((accountError: unknown) => {
      if (!cancelled) {
        setError(boundedAccountError(accountError));
      }
    }).finally(() => {
      window.clearTimeout(bootTimeout);
      if (!cancelled && operation === authOperationRef.current) { initialSessionLoadedRef.current = true; setLoading(false); }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(bootTimeout);
    };
  }, [commitUser, loadAccount]);

  useEffect(() => {
    let disposed = false;
    const refreshSession = async (clearFirst: boolean) => {
      const operation = ++authOperationRef.current;
      if (clearFirst) {
        commitUser(null, false);
        setSessionResolved(false);
      }
      try {
        const state = localAuthAvailable && localStorage.getItem(LOCAL_SESSION_KEY)
          ? { user: localOwnerUser(), authentication: DEFAULT_AUTHENTICATION }
          : await currentAuthenticationState();
        if (disposed || operation !== authOperationRef.current) return;
        setAuthentication(state.authentication);
        setSessionResolved(true);
        if (state.user?.uid !== userRef.current?.uid) {
          const active = commitUser(state.user, false);
          await loadAccount(active);
        }
      } catch {
        // A failed check cannot authorize another account. Explicitly owned
        // offline drafts remain on disk and can be resumed after sign-in.
        if (clearFirst && !disposed) setError("Your session could not be confirmed. Sign in again to continue.");
      } finally {
        if (!disposed && operation === authOperationRef.current) { initialSessionLoadedRef.current = true; setLoading(false); }
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== LEARNER_SESSION_CHANGE_KEY && event.key !== LOCAL_SESSION_KEY && event.key !== null) return;
      authOperationRef.current += 1;
      if (event.newValue?.startsWith("signed-out:") || (event.key === LOCAL_SESSION_KEY && !event.newValue) || event.key === null) {
        commitUser(null, false);
        setLoading(false);
      } else {
        void refreshSession(true);
      }
    };
    const onInvalidated = () => {
      authOperationRef.current += 1;
      commitUser(null, false);
      setLoading(false);
    };
    const onFocus = () => { if (initialSessionLoadedRef.current) void refreshSession(false); };
    const onVisibility = () => { if (document.visibilityState === "visible") onFocus(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener(LEARNER_SESSION_INVALIDATED_EVENT, onInvalidated);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LEARNER_SESSION_INVALIDATED_EVENT, onInvalidated);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [commitUser, loadAccount]);

  const signIn = useCallback(async () => {
    setError(null);
    if (!isManagedAuthConfigured) {
      if (localAuthAvailable) {
        const localUser = localOwnerUser();
        localStorage.setItem(LOCAL_SESSION_KEY, "1");
        const active = commitUser(localUser);
        await loadAccount(active).catch(() => undefined);
        return localUser;
      }
      const unavailable = new Error("Managed authentication is not configured.");
      setError("Secure sign-in is not available in this build.");
      throw unavailable;
    }
    const provider = authentication.primaryProvider;
    if (!provider || !managedProviderAvailable(authentication)) {
      const unavailable = new Error("The selected managed provider is unavailable.");
      setError("Secure sign-in is temporarily unavailable.");
      throw unavailable;
    }
    try {
      return await beginManagedSignIn(
        `${window.location.pathname}${window.location.search}`,
      );
    } catch (signInError) {
      setError(authErrorMessage(signInError));
      throw signInError;
    }
  }, [authentication, commitUser, loadAccount]);

  const signInWithRedirect = useCallback(async (postLoginPath?: string) => {
    setError(null);
    if (!isManagedAuthConfigured) {
      if (localAuthAvailable) {
        const localUser = localOwnerUser();
        localStorage.setItem(LOCAL_SESSION_KEY, "1");
        const active = commitUser(localUser);
        await persistLegalAcceptance(localUser, "signup");
        await loadAccount(active).catch(() => undefined);
        if (postLoginPath) window.location.assign(safeAuthenticationReturnPath(postLoginPath));
        return;
      }
      setError("Secure sign-in is not available in this build.");
      throw new Error("Managed authentication is not configured.");
    }
    const provider = authentication.primaryProvider;
    if (!provider || !managedProviderAvailable(authentication)) {
      setError("Secure sign-in is temporarily unavailable.");
      throw new Error("The selected managed provider is unavailable.");
    }
    try {
      sessionStorage.setItem(
        PENDING_MANAGED_REDIRECT_ACCEPTANCE_KEY,
        JSON.stringify(pendingManagedRedirectAcceptance()),
      );
      await beginManagedSignIn(
        postLoginPath ?? `${window.location.pathname}${window.location.search}`,
      );
    } catch (redirectError) {
      sessionStorage.removeItem(PENDING_MANAGED_REDIRECT_ACCEPTANCE_KEY);
      setError(authErrorMessage(redirectError));
      throw redirectError;
    }
  }, [authentication, commitUser, loadAccount]);

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
    initialSessionLoadedRef.current = true;
    authOperationRef.current += 1;
    commitUser(null);
    setAccount(null);
    setLoading(false);
    setError(null);
    sessionStorage.removeItem(PENDING_MANAGED_REDIRECT_ACCEPTANCE_KEY);
    if (localAuthAvailable && localStorage.getItem(LOCAL_SESSION_KEY)) {
      localStorage.removeItem(LOCAL_SESSION_KEY);
      return;
    }
    if (!isManagedAuthConfigured && !user) return;
    await signOutFromAuthentication("/");
  }, [commitUser, user]);

  const reauthenticate = useCallback(async (postLoginPath = "/privacy-center") => {
    if (localAuthAvailable && localStorage.getItem(LOCAL_SESSION_KEY)) return localOwnerUser();
    if (!user || user.provider === "local") throw new Error("Sign in before confirming this action.");
    const nextUser = await beginManagedReauthentication(user.uid, postLoginPath);
    return commitUser(nextUser)!;
  }, [commitUser, user]);

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
      sessionResolved,
      error,
      clearError: () => setError(null),
      signIn,
      signInWithRedirect,
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
      sessionResolved,
      error,
      signIn,
      signInWithRedirect,
      reauthenticate,
      acceptLegalTerms,
      signOut,
      refreshAccount,
    ],
  );

  return <AuthContext.Provider value={value}><Fragment key={sessionRevision}>{children}</Fragment></AuthContext.Provider>;
}
