"use client";

import { Crown } from "lucide-react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import CourseLibrary from "@/components/CourseLibrary";
import { useAuth } from "@/components/AuthProvider";

export default function LibraryPage() {
  const router = useRouter();
  const { user } = useAuth();
  return (
    <AppShell>
      <div className="library-page">
        <header className="page-header library-page-header">
          <div><p className="overline">Published learning paths</p><h1>Find the next idea worth mastering.</h1><p>Every published course is open to read. Sign in to sync progress, schedule reviews, and save your place.</p></div>
          {!user && <button className="button button-secondary" onClick={() => router.push("/pricing")}><Crown size={16} /> Compare free and Pro</button>}
        </header>
        <CourseLibrary />
      </div>
    </AppShell>
  );
}
