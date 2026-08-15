"use client";

import { UserRoundPlus } from "lucide-react";

interface AccountStartButtonProps {
  className?: string;
  label?: string;
}

export default function AccountStartButton({ className = "button button-secondary", label = "Create a free account" }: AccountStartButtonProps) {
  return (
    <button
      className={className}
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("filosage:open-auth"))}
    >
      <UserRoundPlus size={16} aria-hidden="true" />
      {label}
    </button>
  );
}
