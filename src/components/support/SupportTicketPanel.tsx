"use client";

import Link from "next/link";
import { ArrowRight, TicketCheck } from "lucide-react";
import type { MouseEvent } from "react";
import { SUPPORT_CONTACT } from "@/lib/legal";
import { useSupportCapabilities } from "./useSupportCapabilities";
import { useAuth } from "@/components/AuthProvider";

export default function SupportTicketPanel() {
  const { isOwner } = useAuth();
  const { status } = useSupportCapabilities();
  const available = status === "available";

  const openSupportCenter = (event: MouseEvent<HTMLButtonElement>) => {
    window.dispatchEvent(new CustomEvent("filosage:open-support-center", { detail: { view: "new", opener: event.currentTarget } }));
  };

  return (
    <section className="support-ticket-panel" aria-labelledby="support-ticket-title">
      <div className="support-ticket-intro">
        <span className="support-ticket-icon"><TicketCheck size={21} aria-hidden="true" /></span>
        <div>
          <h2 id="support-ticket-title">Contact Filosage support</h2>
          <p>{available ? "Send an account-linked request and track published responses in the Support Center." : "Use the help guides or email Filosage support. Existing account-linked requests remain in My requests."}</p>
        </div>
        {!available ? (
          <a className="button button-secondary" href={`mailto:${SUPPORT_CONTACT}?subject=Filosage%20support%20request`}>Email {SUPPORT_CONTACT}</a>
        ) : isOwner ? (
          <Link className="button button-secondary" href="/admin/command-center">Open owner queue</Link>
        ) : (
          <button className="button button-primary" type="button" onClick={openSupportCenter}>Send a support request <ArrowRight size={16} /></button>
        )}
      </div>
    </section>
  );
}
