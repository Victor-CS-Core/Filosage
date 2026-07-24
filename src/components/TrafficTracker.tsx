"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function routeBucket(pathname: string) {
  if (pathname === "/") return "/";
  if (pathname.startsWith("/course/") && pathname.includes("/lesson/")) return "/lesson";
  if (pathname.startsWith("/course/")) return "/course";
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  const known = new Set([
    "library",
    "pricing",
    "progress",
    "review",
    "create",
    "profile",
    "privacy-center",
    "terms",
    "privacy",
    "acceptable-use",
    "copyright",
  ]);
  return firstSegment && known.has(firstSegment) ? `/${firstSegment}` : "/other";
}

function sourceBucket() {
  if (!document.referrer) return "direct";
  try {
    return new URL(document.referrer).origin === window.location.origin ? "internal" : "external";
  } catch {
    return "direct";
  }
}

export default function TrafficTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const route = routeBucket(pathname);
    const day = new Date().toISOString().slice(0, 10);
    const storageKey = `erudoza:traffic:${day}:${route}`;
    try {
      if (sessionStorage.getItem(storageKey)) return;
      sessionStorage.setItem(storageKey, "1");
    } catch {
      // Traffic measurement is optional when browser storage is unavailable.
    }

    void fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ route, source: sourceBucket() }),
      keepalive: true,
    }).catch(() => {
      // Analytics must never interrupt learning.
    });
  }, [pathname]);

  return null;
}
