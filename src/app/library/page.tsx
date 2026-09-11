"use client";

import Link from "next/link";
import { Crown } from "lucide-react";
import AppShell from "@/components/AppShell";
import CourseLibrary from "@/components/CourseLibrary";
import { useAuth } from "@/components/AuthProvider";

export default function LibraryPage() {
  const { user } = useAuth();
  return (
    <AppShell publicWhileLoading>
      <div className="library-page">
        <header className="page-header library-page-header">
          <div><p className="overline">Published courses</p><h1>Find your next course.</h1><p>Browse every topic and inspect its complete course outline. A free account opens lessons and keeps your progress, practice, and reviews in sync.</p></div>
          {!user && <Link className="button button-secondary" href="/pricing"><Crown size={16} /> Compare memberships</Link>}
        </header>
        <CourseLibrary />
      </div>
    </AppShell>
  );
}
