import {
  firebaseAuthRelayOrigin,
  firebaseAuthRelayRequestHeaders,
  firebaseAuthRelayResponseHeaders,
} from "@/lib/firebase-auth-relay";

const MAX_FIREBASE_AUTH_BODY_BYTES = 1024 * 1024;

async function relayFirebaseAuth(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const origin = firebaseAuthRelayOrigin(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
  if (!origin) return Response.json({ error: "Firebase auth relay is unavailable." }, { status: 503 });

  const { path } = await context.params;
  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join("/");
  const incomingUrl = new URL(request.url);
  const upstreamUrl = `${origin}/__/auth/${encodedPath}${incomingUrl.search}`;
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let body: ArrayBuffer | undefined;
  if (hasBody) {
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_FIREBASE_AUTH_BODY_BYTES) {
      return Response.json({ error: "Firebase auth request is too large." }, { status: 413 });
    }
  }

  const upstream = await fetch(upstreamUrl, {
    method: request.method,
    headers: firebaseAuthRelayRequestHeaders(request.headers),
    body,
    redirect: "manual",
    cache: "no-store",
  });
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: firebaseAuthRelayResponseHeaders(upstream.headers),
  });
}

export const GET = relayFirebaseAuth;
export const POST = relayFirebaseAuth;
export const HEAD = relayFirebaseAuth;
export const OPTIONS = relayFirebaseAuth;
