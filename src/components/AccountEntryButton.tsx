"use client";

import type { ComponentType } from "react";
import { useAuth } from "@/components/AuthProvider";
import type { ManagedAuthenticationState } from "@/lib/identity-client";

export type AccountEntryMode = "create" | "sign-in" | "unavailable";

export function accountEntryMode(
  authentication: ManagedAuthenticationState["authentication"],
): AccountEntryMode {
  if (authentication.externalIdNewAccountsAvailable || authentication.legacyGoogleAvailable) return "create";
  if (authentication.externalIdAvailable) return "sign-in";
  return "unavailable";
}

export function useAccountEntryMode() {
  return accountEntryMode(useAuth().authentication);
}

export interface AccountEntryRequest {
  returnFocus: HTMLElement | null;
  returnPath?: string;
}

export function openAccountEntry(returnFocus?: HTMLElement | null, returnPath?: string) {
  window.dispatchEvent(new CustomEvent("filosage:open-auth", {
    detail: {
      returnFocus: returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null),
      ...(returnPath ? { returnPath } : {}),
    } satisfies AccountEntryRequest,
  }));
}

interface AccountEntryButtonProps {
  className?: string;
  createLabel?: string;
  signInLabel?: string;
  unavailableLabel?: string;
  icon?: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  returnPath?: string;
}

export default function AccountEntryButton({
  className = "button button-primary",
  createLabel = "Create a free account",
  signInLabel = "Sign in to your account",
  unavailableLabel = "Sign-in unavailable",
  icon: Icon,
  returnPath,
}: AccountEntryButtonProps) {
  const mode = useAccountEntryMode();
  const label = mode === "create" ? createLabel : mode === "sign-in" ? signInLabel : unavailableLabel;
  return (
    <button
      className={className}
      type="button"
      disabled={mode === "unavailable"}
      onClick={(event) => openAccountEntry(event.currentTarget, returnPath)}
    >
      {Icon && <Icon size={16} aria-hidden={true} />}
      {label}
    </button>
  );
}
