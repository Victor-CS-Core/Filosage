export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { ok: true, status: "started" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
