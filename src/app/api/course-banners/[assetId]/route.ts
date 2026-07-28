import { getStoredDocument } from "@/lib/firebase-server";

interface RouteParams {
  params: Promise<{ assetId: string }>;
}

function decodeBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function GET(request: Request, { params }: RouteParams) {
  const { assetId } = await params;
  if (!/^[a-f0-9]{32}$/.test(assetId)) {
    return Response.json({ error: "Banner not found." }, { status: 404 });
  }

  const etag = `"${assetId}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  try {
    const asset = await getStoredDocument(`courseBannerAssets/${assetId}`);
    if (
      !asset
      || asset.contentType !== "image/webp"
      || typeof asset.data !== "string"
      || typeof asset.bytes !== "number"
      || asset.bytes <= 0
      || asset.bytes > 650_000
    ) {
      return Response.json({ error: "Banner not found." }, { status: 404 });
    }

    const bytes = decodeBase64(asset.data);
    if (bytes.byteLength !== asset.bytes) {
      return Response.json({ error: "Banner unavailable." }, { status: 502 });
    }

    return new Response(bytes, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(bytes.byteLength),
        "Content-Type": "image/webp",
        "Cross-Origin-Resource-Policy": "same-origin",
        ETag: etag,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Course banner fetch failed:", error);
    return Response.json(
      { error: "Banner unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
