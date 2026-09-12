"use client";

import dynamic from "next/dynamic";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import LandingPage from "@/components/marketing/LandingPage";
import "@/styles/brand/visitor-home.css";

const LearnerHome = dynamic(() => import("@/components/LearnerHome"), {
  loading: () => <main className="auth-boot-shell" aria-busy="true" aria-label="Loading your courses"><p>Loading your courses…</p></main>,
});

export default function Home() {
  const { user } = useAuth();
  if (user) return <LearnerHome />;

  return <AppShell publicWhileLoading><LandingPage /></AppShell>;
}
