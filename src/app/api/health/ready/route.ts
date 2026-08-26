import { checkDocumentStoreReadiness } from "@/lib/document-store";
import { checkWithinDeadline } from "@/lib/readiness-deadline";
import { missingRuntimeConfiguration } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";
const DATASTORE_READINESS_DEADLINE_MS = 3_500;

export async function GET() {
  const configurationReady = missingRuntimeConfiguration().length === 0;
  let datastoreReady = false;

  if (configurationReady) {
    datastoreReady = await checkWithinDeadline(
      checkDocumentStoreReadiness,
      DATASTORE_READINESS_DEADLINE_MS,
    );
    if (!datastoreReady) console.error("Readiness datastore probe failed.");
  }

  const ok = configurationReady && datastoreReady;
  return Response.json(
    {
      ok,
      status: ok ? "ready" : "not-ready",
      checks: {
        configuration: configurationReady,
        datastore: datastoreReady,
      },
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
