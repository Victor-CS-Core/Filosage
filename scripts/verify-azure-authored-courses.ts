import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BlobClient, BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import pg from "pg";
import { fromFirestoreFields, type FirestoreValue } from "../src/lib/firestore-values.ts";

interface MigrationBundle {
  schemaVersion: 1 | 2;
  owner: { uid: string; email: string };
  documents: Array<{ path: string; fields: Record<string, FirestoreValue> }>;
  bannerObjects: Array<{ assetId: string; contentType: string; base64: string }>;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

const inputArgument = process.argv.find((value) => value.startsWith("--input="))?.slice(8);
const inputBlobArgument = process.argv.find((value) => value.startsWith("--input-blob="))?.slice(13);
if (inputArgument && inputBlobArgument) throw new Error("Use either --input or --input-blob, not both.");
const input = inputBlobArgument
  ? (await new BlobClient(inputBlobArgument, new DefaultAzureCredential()).downloadToBuffer()).toString("utf8")
  : await readFile(resolve(inputArgument || "migration-private/firebase-authored-courses.json"), "utf8");
const bundle = JSON.parse(input) as MigrationBundle;
if (![1, 2].includes(bundle.schemaVersion) || !Array.isArray(bundle.documents) || !Array.isArray(bundle.bannerObjects)) {
  throw new Error("Unsupported or invalid migration bundle.");
}

const allowedPath = /^(?:courses\/[^/]+(?:\/lessons\/[^/]+)?|courseReleases\/[^/]+(?:\/lessons\/[^/]+)?|courseBannerAssets\/[^/]+|courseBannerKeys\/[^/]+)$/;
const paths = bundle.documents.map((document) => document.path);
if (!paths.length || paths.some((path) => !allowedPath.test(path)) || new Set(paths).size !== paths.length) {
  throw new Error("The migration bundle has missing, duplicate, or out-of-scope document paths.");
}
const bannerById = new Map(bundle.bannerObjects.map((object) => [object.assetId, object]));
if (bannerById.size !== bundle.bannerObjects.length) throw new Error("The migration bundle has duplicate banner objects.");

const expected = new Map(bundle.documents.map((document) => {
  const data = fromFirestoreFields(document.fields);
  const assetMatch = /^courseBannerAssets\/([^/]+)$/.exec(document.path);
  if (assetMatch && bannerById.has(assetMatch[1])) {
    delete data.data;
    data.storage = "azure-blob";
    data.objectKey = `course-banners/${assetMatch[1]}.webp`;
  }
  return [document.path, data] as const;
}));

const databaseUrlValue = process.env.DATABASE_URL?.trim();
const storageAccountUrl = process.env.AZURE_STORAGE_ACCOUNT_URL?.trim();
if (!databaseUrlValue || !storageAccountUrl) {
  throw new Error("DATABASE_URL and AZURE_STORAGE_ACCOUNT_URL are required.");
}
const databaseUrl = new URL(databaseUrlValue);
const hostOverride = process.env.DATABASE_HOST_OVERRIDE?.trim();
if (hostOverride) databaseUrl.hostname = hostOverride;
const sslMode = process.env.DATABASE_SSL?.trim().toLowerCase() || "verify-full";
const pool = new pg.Pool({
  connectionString: databaseUrl.toString(),
  ssl: sslMode === "disable" ? false : { rejectUnauthorized: sslMode !== "require" },
  max: 1,
});

try {
  const result = await pool.query<{ path: string; data: Record<string, unknown> }>(
    "SELECT path, data FROM filosage_documents WHERE path = ANY($1::text[]) ORDER BY path",
    [paths],
  );
  const actual = new Map(result.rows.map((row) => [row.path, row.data]));
  const missing = paths.filter((path) => !actual.has(path));
  const mismatched = paths.filter((path) => actual.has(path) && canonical(actual.get(path)) !== canonical(expected.get(path)));
  const extras = (await pool.query<{ path: string }>(
    `SELECT path FROM filosage_documents
     WHERE (path LIKE 'courses/%' OR path LIKE 'courseReleases/%' OR path LIKE 'courseBannerAssets/%' OR path LIKE 'courseBannerKeys/%')
       AND NOT (path = ANY($1::text[]))
     ORDER BY path`,
    [paths],
  )).rows.map((row) => row.path);
  if (missing.length || mismatched.length || extras.length) {
    throw new Error(`Azure document verification failed: ${JSON.stringify({ missing, mismatched, extras })}`);
  }

  const blobService = new BlobServiceClient(storageAccountUrl, new DefaultAzureCredential());
  const containerName = process.env.AZURE_STORAGE_BANNER_CONTAINER?.trim() || "course-banners";
  const container = blobService.getContainerClient(containerName);
  const expectedBlobNames = new Set(bundle.bannerObjects.map((object) => `course-banners/${object.assetId}.webp`));
  const actualBlobNames: string[] = [];
  for await (const blob of container.listBlobsFlat({ prefix: "course-banners/" })) actualBlobNames.push(blob.name);
  const missingBlobs = [...expectedBlobNames].filter((name) => !actualBlobNames.includes(name));
  const extraBlobs = actualBlobNames.filter((name) => !expectedBlobNames.has(name));
  const mismatchedBlobs: string[] = [];
  const bannerHashes: Array<[string, string]> = [];
  for (const object of bundle.bannerObjects) {
    const name = `course-banners/${object.assetId}.webp`;
    if (missingBlobs.includes(name)) continue;
    const blob = container.getBlobClient(name);
    const [bytes, properties] = await Promise.all([blob.downloadToBuffer(), blob.getProperties()]);
    const expectedBytes = Buffer.from(object.base64, "base64");
    const expectedHash = sha256(expectedBytes);
    const actualHash = sha256(bytes);
    if (actualHash !== expectedHash || properties.contentType !== object.contentType) mismatchedBlobs.push(name);
    bannerHashes.push([name, actualHash]);
  }
  if (missingBlobs.length || extraBlobs.length || mismatchedBlobs.length) {
    throw new Error(`Azure banner verification failed: ${JSON.stringify({ missingBlobs, extraBlobs, mismatchedBlobs })}`);
  }

  const courseCount = paths.filter((path) => /^courses\/[^/]+$/.test(path)).length;
  const lessonCount = paths.filter((path) => /^courses\/[^/]+\/lessons\/[^/]+$/.test(path)).length;
  const releaseCount = paths.filter((path) => /^courseReleases\/[^/]+(?:\/lessons\/[^/]+)?$/.test(path)).length;
  const contentSha256 = sha256(canonical({
    documents: [...expected.entries()].sort(([left], [right]) => left.localeCompare(right)),
    banners: bannerHashes.sort(([left], [right]) => left.localeCompare(right)),
  }));
  console.log(`AZURE_COURSE_MIGRATION_CONTENT_VERIFIED ${JSON.stringify({
    documents: paths.length,
    courses: courseCount,
    lessons: lessonCount,
    releases: releaseCount,
    banners: bundle.bannerObjects.length,
    contentSha256,
  })}`);
} finally {
  await pool.end();
}
