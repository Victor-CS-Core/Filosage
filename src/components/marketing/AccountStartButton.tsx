"use client";

import { useSyncExternalStore } from "react";
import { UserRoundPlus } from "lucide-react";

interface AccountStartButtonProps {
  className?: string;
  label?: string;
}

const subscribeToHydration = () => () => undefined;
const getInteractiveSnapshot = () => true;
const getServerInteractiveSnapshot = () => false;

export default function AccountStartButton({ className = "button button-secondary", label = "Create a free account" }: AccountStartButtonProps) {
  const interactive = useSyncExternalStore(
    subscribeToHydration,
    getInteractiveSnapshot,
    getServerInteractiveSnapshot,
  );

  return (
    <button
      className={className}
      type="button"
      disabled={!interactive}
      onClick={(event) => window.dispatchEvent(new CustomEvent("filosage:open-auth", {
        detail: event.currentTarget,
      }))}
    >
      <UserRoundPlus size={16} aria-hidden="true" />
      {label}
    </button>
  );
}
