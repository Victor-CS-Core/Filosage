import { z } from "zod";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { runStoredDocumentTransaction } from "@/lib/firebase-server";
import { enforceBestEffortRateLimit } from "@/lib/request-rate-limit";

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
}).strict();

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
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      return new Response(null, { status: 204 });
    }

    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const { route, source } = parsed.data;
    const path = `trafficDaily/${date}__${documentRouteKey(route)}`;
    await runStoredDocumentTransaction([path], (documents) => {
      const current = documents[path];
      return {
        writes: [{
          path,
          data: {
            ...(current ?? {}),
            date,
            route,
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
