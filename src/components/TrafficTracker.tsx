"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { trackPageView } from "@/lib/product-analytics";

export default function TrafficTracker() {
  const pathname = usePathname();
  const { isOwner, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    trackPageView(pathname, isOwner);
  }, [isOwner, loading, pathname]);

  return null;
}
