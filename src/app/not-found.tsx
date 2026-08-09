import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Library } from "lucide-react";
import FilosageMark from "@/components/FilosageMark";

export const metadata: Metadata = {
  title: "Page not found",
  description: "The requested Filosage page could not be found.",
};

export default function NotFound() {
  return (
    <main className="center-state release-fallback" id="main-content">
      <FilosageMark className="brand-mark" />
      <p className="overline">Page not found</p>
      <h1>This path does not lead to a lesson.</h1>
      <p>The page may have moved, or the address may be incomplete. Your learning progress has not been changed.</p>
      <div className="fallback-actions" aria-label="Page recovery options">
        <Link className="button button-primary" href="/library">
          <Library size={16} aria-hidden="true" /> Browse courses
        </Link>
        <Link className="button button-secondary" href="/">
          <ArrowLeft size={16} aria-hidden="true" /> Return home
        </Link>
      </div>
    </main>
  );
}
