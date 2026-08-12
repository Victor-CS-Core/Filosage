import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fromFirestoreFields, type FirestoreDocument, type FirestoreValue } from "../src/lib/firestore-values.ts";

interface ExportedDocument {
  path: string;
  fields: Record<string, FirestoreValue>;
}

interface MigrationBundle {
  schemaVersion: 1;
  exportedAt: string;
  sourceProjectId: string;
  owner: { uid: string; email: string };
  documents: ExportedDocument[];
  bannerObjects: Array<{ assetId: string; contentType: string; base64: string }>;
}

const outputArgument = process.argv.find((value) => value.startsWith("--output="))?.slice(9);
const ownerUidArgument = process.argv.find((value) => value.startsWith("--owner-uid="))?.slice(12);
const sourceUrlArgument = process.argv.find((value) => value.startsWith("--source-url="))?.slice(13);
const outputPath = resolve(outputArgument || "migration-private/firebase-authored-courses.json");
const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();

if (!projectId || !clientEmail || !privateKey || !ownerEmail) {
  throw new Error("FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, and OWNER_EMAIL are required.");
}
const sourceProjectId: string = projectId;
const sourceClientEmail: string = clientEmail;
const sourcePrivateKey: string = privateKey;
const sourceOwnerEmail: string = ownerEmail;

function base64Url(value: string | Uint8Array) {
  return Buffer.from(value).toString("base64url");
}

async function accessToken() {
  const now = Math.floor(Date.now() / 1_000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    iss: sourceClientEmail,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3_600,
  }));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Buffer.from(sourcePrivateKey.replace(/-----[^-]+-----|\s/g, ""), "base64"),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const unsigned = `${header}.${payload}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, Buffer.from(unsigned));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64Url(new Uint8Array(signature))}`,
    }),
  });
  if (!response.ok) throw new Error(`Firebase source authentication failed (${response.status}).`);
  const body = await response.json() as { access_token?: string };
  if (!body.access_token) throw new Error("Firebase source authentication returned no access token.");
  return body.access_token;
}

function documentPath(document: FirestoreDocument) {
  const marker = "/documents/";
  const index = document.name.indexOf(marker);
  if (index < 0) throw new Error("Firebase returned an invalid document name.");
  return document.name.slice(index + marker.length);
}

async function listCollection(token: string, path: string) {
  const documents: FirestoreDocument[] = [];
  let pageToken = "";
  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${sourceProjectId}/databases/(default)/documents/${path}`);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 404) return documents;
    if (!response.ok) throw new Error(`Firebase export read failed for ${path} (${response.status}).`);
    const body = await response.json() as { documents?: FirestoreDocument[]; nextPageToken?: string };
    documents.push(...(body.documents ?? []));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return documents;
}

function exported(document: FirestoreDocument): ExportedDocument {
  return { path: documentPath(document), fields: document.fields ?? {} };
}

async function main() {
  const token = await accessToken();
  const users = await listCollection(token, "users");
  const owner = ownerUidArgument
    ? users.find((document) => documentPath(document).split("/").at(-1) === ownerUidArgument)
    : users.find((document) => {
      const data = fromFirestoreFields(document.fields ?? {});
      return typeof data.email === "string" && data.email.trim().toLowerCase() === sourceOwnerEmail;
    });
  if (!owner) throw new Error("The owner Firebase UID could not be resolved. Pass --owner-uid=UID after verifying it in Firebase.");
  const ownerUid = documentPath(owner).split("/").at(-1) ?? "";

  const allCourses = await listCollection(token, "courses");
  const courses = allCourses.filter((document) => fromFirestoreFields(document.fields ?? {}).authorId === ownerUid);
  if (!courses.length) throw new Error("No courses authored by the resolved owner were found; no bundle was written.");

  const documents: ExportedDocument[] = [];
  const assetIds = new Set<string>();
  for (const course of courses) {
    documents.push(exported(course));
    const courseId = documentPath(course).split("/").at(-1) ?? "";
    const data = fromFirestoreFields(course.fields ?? {});
    const banner = data.banner as Record<string, unknown> | undefined;
    if (typeof banner?.assetId === "string") assetIds.add(banner.assetId);
    documents.push(...(await listCollection(token, `courses/${encodeURIComponent(courseId)}/lessons`)).map(exported));
  }

  const assets = (await listCollection(token, "courseBannerAssets"))
    .filter((document) => assetIds.has(documentPath(document).split("/").at(-1) ?? ""));
  const keys = (await listCollection(token, "courseBannerKeys"))
    .filter((document) => assetIds.has(String(fromFirestoreFields(document.fields ?? {}).assetId ?? "")));
  documents.push(...assets.map(exported), ...keys.map(exported));

  const bannerObjects: MigrationBundle["bannerObjects"] = [];
  for (const asset of assets) {
    const assetId = documentPath(asset).split("/").at(-1) ?? "";
    const data = fromFirestoreFields(asset.fields ?? {});
    if (typeof data.data === "string" && data.data) {
      bannerObjects.push({ assetId, contentType: "image/webp", base64: data.data });
      continue;
    }
    if (!sourceUrlArgument) {
      throw new Error(`Banner ${assetId} is object-backed. Re-run with --source-url=https://CURRENT_HOST to preserve it.`);
    }
    const response = await fetch(`${sourceUrlArgument.replace(/\/$/, "")}/api/course-banners/${encodeURIComponent(assetId)}`);
    if (!response.ok) throw new Error(`Banner ${assetId} could not be downloaded from the current host (${response.status}).`);
    bannerObjects.push({
      assetId,
      contentType: response.headers.get("content-type") || "image/webp",
      base64: Buffer.from(await response.arrayBuffer()).toString("base64"),
    });
  }

  const bundle: MigrationBundle = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    sourceProjectId,
    owner: { uid: ownerUid, email: sourceOwnerEmail },
    documents,
    bannerObjects,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(`Exported ${courses.length} owner course(s), ${documents.length} total document(s), and ${bannerObjects.length} banner object(s).`);
  console.log(`Private bundle written to ${outputPath}. It is gitignored; do not commit or share it.`);
}

await main();
