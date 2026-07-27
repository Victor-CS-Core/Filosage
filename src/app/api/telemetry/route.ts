import { z } from "zod";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { createStoredDocument, runStoredDocumentTransaction } from "@/lib/firebase-server";
import { enforceBestEffortRateLimit } from "@/lib/request-rate-limit";
import { isLocalMode } from "@/lib/local-mode";

const telemetrySchema = z.object({
  route: z.enum([
    "/",
    "/lesson",
    "/course",
    "/library",
    "/pricing",
    "/progress",
    "/review",
    "/create",
    "/profile",
    "/privacy-center",
    "/terms",
    "/privacy",
    "/acceptable-use",
    "/copyright",
    "/other",
  ]),
  source: z.enum(["direct", "internal", "external"]),
  event: z.enum([
    "page_view",
    "signup_started",
    "signup_completed",
    "course_started",
    "lesson_completed",
    "pricing_interest",
  ]).default("page_view"),
}).strict();

const TRAFFIC_SHARDS = 16;

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function documentRouteKey(route: string) {
  return route === "/" ? "home" : route.slice(1).replace(/[^a-z-]/g, "-");
}

export async function POST(request: Request) {
  const limited = enforceBestEffortRateLimit(request, "telemetry", 30);
  if (limited) return limited;
  try {
    const parsed = telemetrySchema.safeParse(await readJsonBody(request, 512));
    if (!parsed.success) {
      return Response.json({ error: "Invalid traffic event." }, { status: 400 });
    }
    if (!isLocalMode() && (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY)) {
      return new Response(null, { status: 204 });
    }

    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const { route, source, event } = parsed.data;
    if (event !== "page_view") {
      await createStoredDocument("productEvents", {
        date,
        route,
        source,
        event,
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
