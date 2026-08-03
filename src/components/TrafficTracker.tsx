"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import {
  ANALYTICS_CONSENT_CHANGED_EVENT,
  trackPageView,
} from "@/lib/product-analytics";

export default function TrafficTracker() {
  const pathname = usePathname();
  const { isOwner, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    const track = () => trackPageView(pathname, isOwner);
    track();
    window.addEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, track);
    return () => window.removeEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, track);
  }, [isOwner, loading, pathname]);

  return null;
}
