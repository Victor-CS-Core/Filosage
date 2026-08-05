"use client";

import type { ReactNode } from "react";
import { useId, useState } from "react";

function emailAddressFromHref(href: string) {
  return decodeURIComponent(href.slice("mailto:".length).split("?", 1)[0]);
}

async function copyEmailAddress(email: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(email);
      return true;
    } catch {
      // Fall through to the selection-based browser fallback.
    }
  }

  const field = document.createElement("textarea");
  field.value = email;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  return copied;
}

export default function SupportEmailLink({
  href,
  className,
  children,
  presentation = "inline",
}: {
  href: string;
  className?: string;
  children: ReactNode;
  presentation?: "inline" | "call-to-action";
}) {
  const [feedback, setFeedback] = useState("");
  const feedbackId = useId();
  const email = emailAddressFromHref(href);

  const handleClick = () => {
    setFeedback(`Opening your email app. If it does not open, use ${email}.`);
    void copyEmailAddress(email).then((copied) => {
      setFeedback(copied
        ? `${email} copied. If your email app did not open, paste this address into a new message.`
        : `If your email app did not open, send your message to ${email}.`);
    });
  };

  return (
    <span className={`support-email-action support-email-action-${presentation}`}>
      <a className={className} href={href} onClick={handleClick} aria-describedby={feedback ? feedbackId : undefined}>{children}</a>
      <span id={feedbackId} className="support-email-feedback" role="status" aria-live="polite">{feedback}</span>
    </span>
  );
}
