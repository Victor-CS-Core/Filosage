export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { ok: true, status: "live" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
