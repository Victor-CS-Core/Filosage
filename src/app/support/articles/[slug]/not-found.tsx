import Link from "next/link";
import { CircleHelp } from "lucide-react";
import AppShell from "@/components/AppShell";

export default function SupportArticleNotFound() {
  return (
    <AppShell>
      <div className="support-not-found">
        <CircleHelp size={28} aria-hidden="true" />
        <p className="overline">Erudoza support</p>
        <h1>That guide is not available.</h1>
        <p>It may have moved or the address may be incomplete. Search the current help topics instead.</p>
        <Link className="button button-primary" href="/support">Open support</Link>
      </div>
    </AppShell>
  );
}
