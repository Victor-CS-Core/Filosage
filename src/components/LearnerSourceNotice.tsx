"use client";
import Link from "next/link";
import type { LearnerSourceStatus } from "@/lib/learner-source";

export default function LearnerSourceNotice({ label, status, error, retry }: {
  label: string; status: LearnerSourceStatus; error: string | null; retry: () => void;
}) {
  if (status === "loaded" || status === "empty") return null;
  if (status === "loading") return <p role="status">Loading {label.toLowerCase()}…</p>;
  return <div className="state-panel" role="status">
    <div><strong>{label} {status === "stale" ? "may be out of date" : "unavailable"}</strong><p>{error ?? "Account data could not be loaded. Try again."}</p></div>
    <button className="button button-secondary" type="button" onClick={retry}>Retry {label.toLowerCase()}</button>
    {error?.includes("access") && <Link className="text-button" href="/profile">Review account access</Link>}
  </div>;
}
