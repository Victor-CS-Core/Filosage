"use client";

import Link from "next/link";
import { ArrowRight, TicketCheck } from "lucide-react";
import type { MouseEvent } from "react";
import { useAuth } from "@/components/AuthProvider";

export default function SupportTicketPanel() {
  const { isOwner } = useAuth();

  const openSupportCenter = (event: MouseEvent<HTMLButtonElement>) => {
    window.dispatchEvent(new CustomEvent("filosage:open-support-center", { detail: { view: "new", opener: event.currentTarget } }));
  };

  return (
    <section className="support-ticket-panel" aria-labelledby="support-ticket-title">
      <div className="support-ticket-intro">
        <span className="support-ticket-icon"><TicketCheck size={21} aria-hidden="true" /></span>
        <div>
          <h2 id="support-ticket-title">Contact Filosage support</h2>
          <p>Send an account-linked request, receive a reference number, and track published responses in the Support Center.</p>
        </div>
        {isOwner ? (
          <Link className="button button-secondary" href="/admin/command-center">Open owner queue</Link>
        ) : (
          <button className="button button-primary" type="button" onClick={openSupportCenter}>Send a support request <ArrowRight size={16} /></button>
        )}
      </div>
    </section>
  );
}
