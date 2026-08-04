import { z } from "zod";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { createStoredDocument, runStoredDocumentTransaction } from "@/lib/firebase-server";
import { enforceBestEffortRateLimit } from "@/lib/request-rate-limit";
import { isLocalMode } from "@/lib/local-mode";
import {
  ACQUISITION_CHANNELS,
  PRODUCT_EVENT_NAMES,
  PRODUCT_EVENT_ROUTES,
  PRODUCT_EVENT_SCHEMA_VERSION,
} from "@/lib/product-events";
import { serverEnvironment } from "@/lib/runtime-environment";

const telemetrySchema = z.object({
  schemaVersion: z.literal(PRODUCT_EVENT_SCHEMA_VERSION).default(PRODUCT_EVENT_SCHEMA_VERSION),
  route: z.enum(PRODUCT_EVENT_ROUTES),
  source: z.enum(["direct", "internal", "external"]),
  event: z.union([z.literal("page_view"), z.enum(PRODUCT_EVENT_NAMES)]).default("page_view"),
  actorId: z.string().trim().regex(/^[A-Za-z0-9_-]{12,80}$/).optional(),
  sessionId: z.string().trim().regex(/^[A-Za-z0-9_-]{12,80}$/).optional(),
  acquisition: z.object({
    channel: z.enum(ACQUISITION_CHANNELS),
    referralCode: z.string().trim().regex(/^[A-Za-z0-9_-]{8,40}$/).optional(),
    campaign: z.string().trim().max(80).optional(),
    medium: z.string().trim().max(80).optional(),
    referrerHost: z.string().trim().max(120).optional(),
    landingPath: z.string().trim().max(160),
  }).strict().optional(),
  experimentId: z.string().trim().max(120).optional(),
  courseId: z.string().trim().max(120).optional(),
  lessonId: z.string().trim().max(120).optional(),
  objectiveId: z.string().trim().max(120).optional(),
  contentVersion: z.string().trim().max(120).optional(),
  elapsedMs: z.number().int().min(0).max(31_536_000_000).optional(),
  score: z.number().min(0).max(100).optional(),
}).strict();

const TRAFFIC_SHARDS = 16;

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function documentRouteKey(route: string) {
  return route === "/" ? "home" : route.slice(1).replace(/[^a-z-]/g, "-");
}

export async function POST(request: Request) {
  const limited = enforceBestEffortRateLimit(request, "telemetry", 60);
  if (limited) return limited;
  try {
    const parsed = telemetrySchema.safeParse(await readJsonBody(request, 2_048));
    if (!parsed.success) {
      return Response.json({ error: "Invalid traffic event." }, { status: 400 });
    }
    if (!isLocalMode() && (!serverEnvironment.FIREBASE_PROJECT_ID || !serverEnvironment.FIREBASE_CLIENT_EMAIL || !serverEnvironment.FIREBASE_PRIVATE_KEY)) {
      return new Response(null, { status: 204 });
    }

    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const { route, source, event, acquisition } = parsed.data;
    if (event !== "page_view") {
      await createStoredDocument("productEvents", {
        schemaVersion: parsed.data.schemaVersion,
        date,
        route,
        source,
        event,
        actorId: parsed.data.actorId,
        sessionId: parsed.data.sessionId,
        channel: acquisition?.channel ?? source,
        referralCode: acquisition?.referralCode,
        campaign: acquisition?.campaign,
        medium: acquisition?.medium,
        referrerHost: acquisition?.referrerHost,
        landingPath: acquisition?.landingPath,
        experimentId: parsed.data.experimentId,
        courseId: parsed.data.courseId,
        lessonId: parsed.data.lessonId,
        objectiveId: parsed.data.objectiveId,
        contentVersion: parsed.data.contentVersion,
        elapsedMs: parsed.data.elapsedMs,
        score: parsed.data.score,
        createdAt: now.toISOString(),
      });
      return new Response(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const shard = random[0] % TRAFFIC_SHARDS;
    const path = `trafficDailyShards/${date}__${documentRouteKey(route)}__${shard}`;
    await runStoredDocumentTransaction([path], (documents) => {
      const current = documents[path];
      return {
        writes: [{
          path,
          data: {
            ...(current ?? {}),
            date,
            route,
            shard,
            views: numberValue(current?.views) + 1,
            [`${source}Views`]: numberValue(current?.[`${source}Views`]) + 1,
            ...(acquisition?.channel ? {
              [`${acquisition.channel}Views`]: numberValue(current?.[`${acquisition.channel}Views`]) + 1,
            } : {}),
            updatedAt: now.toISOString(),
          },
        }],
        result: undefined,
      };
    });

    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const requestResponse = apiRequestErrorResponse(error);
    if (requestResponse) return requestResponse;
    console.error("Traffic event failed:", error);
    return new Response(null, { status: 204 });
  }
}
