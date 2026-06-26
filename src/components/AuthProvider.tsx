"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import {
  User,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

function isMobileBrowser() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Handle redirect result on app load (mobile SSO flow)
    getRedirectResult(auth).catch(() => {
      // Redirect result errors are non-fatal (e.g. user cancelled)
    });

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    if (isMobileBrowser()) {
      await signInWithRedirect(auth, provider);
    } else {
      await signInWithPopup(auth, provider);
    }
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
