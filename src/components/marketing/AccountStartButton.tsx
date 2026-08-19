"use client";

import { UserRoundPlus } from "lucide-react";
import AccountEntryButton from "@/components/AccountEntryButton";

interface AccountStartButtonProps {
  className?: string;
  label?: string;
}

export default function AccountStartButton({ className = "button button-secondary", label = "Create a free account" }: AccountStartButtonProps) {
  return <AccountEntryButton className={className} createLabel={label} icon={UserRoundPlus} />;
}
