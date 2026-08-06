"use client";

import Link from "next/link";
import { BookMarked, ChevronRight, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

export default function OwnerDocumentationEntry() {
  const { isOwner, loading } = useAuth();
  if (loading || !isOwner) return null;

  return (
    <aside className="support-owner-entry" aria-labelledby="owner-documentation-title">
      <span><BookMarked size={21} aria-hidden="true" /></span>
      <div>
        <p><ShieldCheck size={14} /> Owner-only</p>
        <h2 id="owner-documentation-title">Erudoza owner handbook</h2>
        <span>Product map, course operations, publishing, support, AI controls, trust workflows, and release procedures.</span>
      </div>
      <Link href="/support/owner">Open handbook <ChevronRight size={16} /></Link>
    </aside>
  );
}
