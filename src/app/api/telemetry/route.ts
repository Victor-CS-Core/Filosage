import { z } from "zod";
import { apiRequestErrorResponse, assertTrustedMutation, readJsonBody } from "@/lib/api-security";
import { getVerifiedUser } from "@/lib/auth-server";
import { createStoredDocument, runStoredDocumentTransaction } from "@/lib/firebase-server";
import { enforceDurableRateLimit } from "@/lib/request-rate-limit";
import { isLocalMode } from "@/lib/local-mode";
import {
  ACQUISITION_CHANNELS,
  ANONYMOUS_PRODUCT_EVENT_NAMES,
  COURSE_LANGUAGE_MODES,
  MARKETING_JOB_STARTS,
  MARKETING_SURFACES,
  PRODUCT_EVENT_NAMES,
  PRODUCT_EVENT_ROUTES,
  PRODUCT_EVENT_SCHEMA_VERSION,
  SERVER_RECORDED_PRODUCT_EVENT_NAMES,
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
  surface: z.enum(MARKETING_SURFACES).optional(),
  jobStart: z.enum(MARKETING_JOB_STARTS).optional(),
  courseLanguageMode: z.enum(COURSE_LANGUAGE_MODES).optional(),
}).strict();

const TRAFFIC_SHARDS = 16;

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function documentRouteKey(route: string) {
  return route === "/" ? "home" : route.slice(1).replace(/[^a-z-]/g, "-");
}

export async function POST(request: Request) {
  try {
    assertTrustedMutation(request);
    const limited = await enforceDurableRateLimit(request, "telemetry", 60);
    if (limited) return limited;
    const parsed = telemetrySchema.safeParse(await readJsonBody(request, 2_048));
    if (!parsed.success) {
      return Response.json({ error: "Invalid traffic event." }, { status: 400 });
    }
    if (!isLocalMode() && (!serverEnvironment.FIREBASE_PROJECT_ID || !serverEnvironment.FIREBASE_CLIENT_EMAIL || !serverEnvironment.FIREBASE_PRIVATE_KEY)) {
      return new Response(null, { status: 204 });
    }

    const user = await getVerifiedUser(request);
    const { event } = parsed.data;
    if (SERVER_RECORDED_PRODUCT_EVENT_NAMES.includes(
      event as (typeof SERVER_RECORDED_PRODUCT_EVENT_NAMES)[number],
    )) {
      return Response.json(
        { error: "This event can only be recorded by the action that it represents." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    const anonymousEvent = event === "page_view"
      || ANONYMOUS_PRODUCT_EVENT_NAMES.includes(
        event as (typeof ANONYMOUS_PRODUCT_EVENT_NAMES)[number],
      );
    if (!user && !anonymousEvent) {
      return Response.json(
        { error: "Sign in before recording learning activity." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const { route, source, acquisition } = parsed.data;
    if (event !== "page_view") {
      await createStoredDocument("productEvents", {
        schemaVersion: parsed.data.schemaVersion,
        date,
        route,
        source,
        event,
        // Anonymous analytics is intentionally session-scoped. Never attach a
        // caller-supplied account identifier to an unauthenticated event.
        actorId: user?.uid,
        sessionId: parsed.data.sessionId,
        trust: user ? "authenticated_client" : "anonymous_client",
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
        surface: parsed.data.surface,
        jobStart: parsed.data.jobStart,
        courseLanguageMode: parsed.data.courseLanguageMode,
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
