"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import FilosageMark from "@/components/FilosageMark";
import { safeAuthenticationReturnPath } from "@/lib/auth-return-path";
import styles from "./complete-link.module.css";

const COMPLETE_PATH = "/api/auth/link-intent/complete";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 16 * 1_024;
const DEFAULT_ERROR = "The sign-in connection could not be completed.";
const PUBLIC_ERRORS = new Set([
  DEFAULT_ERROR,
  "That confirmation expired. Sign in with your existing method and try again.",
  "We could not connect that sign-in method. No account data was changed.",
  "Too many requests. Please wait a moment and try again.",
  "Request protection is temporarily unavailable. Please try again shortly.",
  "Sign in with a verified account to continue.",
]);

type CompletionState =
  | { status: "working" }
  | { status: "done"; returnPath: string }
  | { status: "error"; message: string };

interface CompletionResponse {
  linked?: true;
  error?: string;
  returnPath?: string;
}

async function boundedJson(response: Response): Promise<CompletionResponse> {
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return {};
  }
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    return {};
  }
  try {
    const reader = response.body?.getReader();
    if (!reader) return {};
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return {};
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const body = value as Record<string, unknown>;
    return {
      linked: body.linked === true ? true : undefined,
      error: typeof body.error === "string" && PUBLIC_ERRORS.has(body.error)
        ? body.error
        : undefined,
      returnPath: typeof body.returnPath === "string" ? body.returnPath : undefined,
    };
  } catch {
    return {};
  }
}

export default function CompleteIdentityLink() {
  const [state, setState] = useState<CompletionState>({ status: "working" });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    let timeout: number | undefined;

    // Scheduling the request lets the first development StrictMode effect clean
    // itself up before network I/O; the live effect is the only one that POSTs.
    const scheduledRequest = window.setTimeout(() => {
      timeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, REQUEST_TIMEOUT_MS);

      void (async () => {
        try {
          const response = await fetch(COMPLETE_PATH, {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });
          const body = await boundedJson(response);
          if (!response.ok || body.linked !== true) {
            throw new Error(body.error ?? DEFAULT_ERROR);
          }
          if (active) {
            setState({
              status: "done",
              returnPath: safeAuthenticationReturnPath(body.returnPath ?? "/profile"),
            });
          }
        } catch (error) {
          if (!active) return;
          setState({
            status: "error",
            message: timedOut
              ? "The secure connection took too long. Return to Filosage and try again."
              : error instanceof Error && PUBLIC_ERRORS.has(error.message)
                ? error.message
                : DEFAULT_ERROR,
          });
        } finally {
          if (timeout !== undefined) window.clearTimeout(timeout);
        }
      })();
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(scheduledRequest);
      if (timeout !== undefined) window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="complete-link-title">
        <FilosageMark className={styles.mark} title="Filosage" />
        {state.status === "working" && (
          <div className={styles.content} role="status" aria-live="polite" aria-busy="true">
            <p className="overline">Secure sign-in</p>
            <h1 id="complete-link-title">Connecting your sign-in</h1>
            <p>Your learning data is not being moved or copied.</p>
          </div>
        )}
        {state.status === "done" && (
          <div className={styles.content} role="status" aria-live="polite">
            <p className="overline">Connected</p>
            <h1 id="complete-link-title">Your sign-in is connected</h1>
            <p>Your courses, progress, notes, and review dates remain with the same Filosage account.</p>
            <Link className={`button button-primary ${styles.action}`} href={state.returnPath}>
              Continue learning
            </Link>
          </div>
        )}
        {state.status === "error" && (
          <div className={styles.content}>
            <p className="overline">Nothing changed</p>
            <h1 id="complete-link-title">We could not connect that sign-in</h1>
            <p role="alert">{state.message}</p>
            <Link className={`button button-primary ${styles.action}`} href="/">
              Return to Filosage
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
