"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { readBoundedJsonResponse } from "@/lib/identity-client";
import { parseSupportCapabilities } from "@/lib/support-capabilities";

export function useSupportCapabilities() {
  const [status, setStatus] = useState<"loading" | "available" | "unavailable" | "unknown">("loading");
  const version = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const readStatus = useCallback(() => {
    const request = ++version.current;
    controller.current?.abort();
    const pending = new AbortController(); controller.current = pending;
    return fetch("/api/support/capabilities", { cache: "no-store", signal: AbortSignal.any([pending.signal, AbortSignal.timeout(8_000)]) }).then(async (response) => {
      if (!response.ok) throw new Error("Support availability could not be confirmed.");
      const capabilities = parseSupportCapabilities(await readBoundedJsonResponse(response, 1_024, "Support availability could not be confirmed."));
      if (!capabilities) throw new Error("Support availability could not be confirmed.");
      if (request === version.current) setStatus(capabilities.submissionEnabled ? "available" : "unavailable");
    }).catch(() => { if (request === version.current) setStatus("unknown"); });
  }, []);
  const refresh = useCallback(() => {
    setStatus("loading");
    return readStatus();
  }, [readStatus]);
  useEffect(() => {
    void readStatus();
    return () => { version.current += 1; controller.current?.abort(); };
  }, [readStatus]);
  return { status, refresh };
}
