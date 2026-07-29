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
          <div><p className="overline">Published courses</p><h1>Find your next course.</h1><p>Browse every topic and inspect its complete course outline. A free account opens lessons and keeps your progress, practice, and reviews in sync.</p></div>
          {!user && <button className="button button-secondary" onClick={() => router.push("/pricing")}><Crown size={16} /> Compare free and Pro</button>}
        </header>
        <CourseLibrary />
      </div>
    </AppShell>
  );
}
