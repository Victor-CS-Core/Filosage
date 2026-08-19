import { authenticationMode, missingRuntimeConfiguration } from "@/lib/runtime-config";
import { getStoredDocument } from "@/lib/firebase-server";
import { flashcardFeatureConfiguration } from "@/lib/flashcard-feature";
import { reportOperationalEvent } from "@/lib/operational-alerts";
import { serverEnvironment } from "@/lib/runtime-environment";

export async function GET() {
  const missing = missingRuntimeConfiguration();
  const flashcards = flashcardFeatureConfiguration();
  const version = (
    serverEnvironment.SITE_VERSION
    || serverEnvironment.CF_PAGES_COMMIT_SHA
    || serverEnvironment.GITHUB_SHA
    || serverEnvironment.VERCEL_GIT_COMMIT_SHA
    || ""
  ).trim().slice(0, 40) || null;
  // Configuration names are operational detail: log them for the operator
  // instead of listing them in the public response.
  if (missing.length) console.error("Runtime configuration incomplete:", missing.join(", "));
  let datastoreOk = false;
  if (!missing.length) {
    try {
      await getStoredDocument("system/health");
      datastoreOk = true;
    } catch (error) {
      datastoreOk = false;
      console.error("Health check datastore probe failed:", error);
      await reportOperationalEvent({
        severity: "critical",
        code: "health.datastore_unavailable",
        message: "The production health check could not reach Firestore.",
      });
    }
  }
  const ok = missing.length === 0 && datastoreOk;
  const origin = (() => {
    try {
      return serverEnvironment.NEXT_PUBLIC_SITE_URL
        ? new URL(serverEnvironment.NEXT_PUBLIC_SITE_URL).origin
        : null;
    } catch {
      return null;
    }
  })();
  return Response.json(
    {
      ok,
      version,
      origin,
      authenticationMode: authenticationMode(),
      checks: {
        configuration: missing.length === 0,
        datastore: datastoreOk,
        flashcardDecks: flashcards.decksEnabled,
        flashcardGeneration: flashcards.generationEnabled,
      },
    },
    {
      status: ok ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
        ...(version ? { "X-Filosage-Version": version } : {}),
      },
    },
  );
}
