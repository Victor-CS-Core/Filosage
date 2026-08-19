import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { BlobClient, BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { fromFirestoreFields, type FirestoreValue } from "../src/lib/firestore-values.ts";

interface MigrationBundle {
  schemaVersion: 1 | 2;
  owner: { uid: string; email: string };
  documents: Array<{ path: string; fields: Record<string, FirestoreValue> }>;
  bannerObjects: Array<{ assetId: string; contentType: string; base64: string }>;
}

const inputArgument = process.argv.find((value) => value.startsWith("--input="))?.slice(8);
const inputBlobArgument = process.argv.find((value) => value.startsWith("--input-blob="))?.slice(13);
const apply = process.argv.includes("--apply");
const missingOnly = process.argv.includes("--missing-only");
const inputPath = resolve(inputArgument || "migration-private/firebase-authored-courses.json");
if (inputArgument && inputBlobArgument) throw new Error("Use either --input or --input-blob, not both.");
const input = inputBlobArgument
  ? (await new BlobClient(inputBlobArgument, new DefaultAzureCredential()).downloadToBuffer()).toString("utf8")
  : await readFile(inputPath, "utf8");
const bundle = JSON.parse(input) as MigrationBundle;
if (![1, 2].includes(bundle.schemaVersion) || !Array.isArray(bundle.documents) || !Array.isArray(bundle.bannerObjects)) {
  throw new Error("Unsupported or invalid migration bundle.");
}
const allowedPath = /^(?:courses\/[^/]+(?:\/lessons\/[^/]+)?|courseReleases\/[^/]+(?:\/lessons\/[^/]+)?|courseBannerAssets\/[^/]+|courseBannerKeys\/[^/]+)$/;
const paths = bundle.documents.map((item) => item.path);
if (paths.some((path) => !allowedPath.test(path))) {
  throw new Error("The bundle contains data outside the approved course, lesson, and banner allowlist.");
}
if (new Set(paths).size !== paths.length) throw new Error("The bundle contains duplicate document paths.");
const courseCount = bundle.documents.filter((item) => /^courses\/[^/]+$/.test(item.path)).length;
const lessonCount = bundle.documents.filter((item) => /^courses\/[^/]+\/lessons\/[^/]+$/.test(item.path)).length;
if (!courseCount) throw new Error("The bundle contains no authored courses.");
const courseIds = new Set(
  bundle.documents
    .filter((item) => /^courses\/[^/]+$/.test(item.path))
    .map((item) => {
      const data = fromFirestoreFields(item.fields);
      if (data.authorId !== bundle.owner.uid) throw new Error(`Course ${item.path} is not authored by the bundle owner.`);
      return item.path.split("/")[1];
    }),
);
if (bundle.documents.some((item) => {
  const match = /^courses\/([^/]+)\/lessons\/[^/]+$/.exec(item.path);
  return match && !courseIds.has(match[1]);
})) throw new Error("The bundle contains a lesson without its parent owner-authored course.");
const assetIds = new Set(
  bundle.documents
    .filter((item) => item.path.startsWith("courseBannerAssets/"))
    .map((item) => item.path.split("/")[1]),
);
const objectAssetIds = new Set(bundle.bannerObjects.map((item) => item.assetId));
if (objectAssetIds.size !== bundle.bannerObjects.length || [...assetIds].some((id) => !objectAssetIds.has(id))) {
  throw new Error("The bundle does not contain exactly one preserved object for every referenced banner asset.");
}
if ([...objectAssetIds].some((id) => !assetIds.has(id))) {
  throw new Error("The bundle contains an unreferenced banner object.");
}
console.log(`Preflight: ${courseCount} course(s), ${lessonCount} lesson(s), ${bundle.bannerObjects.length} banner(s).`);
if (!apply) {
  console.log("Dry run only. Re-run with --apply after reviewing the counts and target configuration.");
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
const accountUrl = process.env.AZURE_STORAGE_ACCOUNT_URL?.trim();
const containerName = process.env.AZURE_STORAGE_BANNER_CONTAINER?.trim() || "course-banners";
if (!databaseUrl || !accountUrl) throw new Error("DATABASE_URL and AZURE_STORAGE_ACCOUNT_URL are required for --apply.");

const sslMode = process.env.DATABASE_SSL?.trim().toLowerCase() || "verify-full";
const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: sslMode === "disable" ? false : { rejectUnauthorized: sslMode !== "require" },
  max: 1,
});
const schemaCheck = await pool.query<{ table_name: string }>(
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'filosage_documents'",
);
if (!schemaCheck.rows[0]) {
  await pool.end();
  throw new Error("The Azure document schema is missing. Run migrate:azure:database before importing courses.");
}
const existing = await pool.query<{ path: string; data: Record<string, unknown> }>(
  "SELECT path, data FROM filosage_documents WHERE path = ANY($1::text[])",
  [paths],
);
if (existing.rows[0] && !missingOnly) {
  await pool.end();
  throw new Error(`Azure already contains ${existing.rows[0].path}; the import is create-only.`);
}
const bannerObjectIds = new Set(bundle.bannerObjects.map((object) => object.assetId));
const expectedDocumentData = (document: MigrationBundle["documents"][number]) => {
  const data = fromFirestoreFields(document.fields);
  const assetId = document.path.startsWith("courseBannerAssets/") ? document.path.split("/")[1] : "";
  if (assetId && bannerObjectIds.has(assetId)) {
    delete data.data;
    data.storage = "azure-blob";
    data.objectKey = `course-banners/${assetId}.webp`;
  }
  return data;
};
const expectedByPath = new Map(bundle.documents.map((document) => [document.path, expectedDocumentData(document)]));
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
};
for (const row of existing.rows) {
  if (canonical(row.data) !== canonical(expectedByPath.get(row.path))) {
    await pool.end();
    throw new Error(`Azure already contains conflicting data at ${row.path}; no changes were made.`);
  }
}
const existingPaths = new Set(existing.rows.map((row) => row.path));
const documentsToInsert = bundle.documents.filter((document) => !existingPaths.has(document.path));

const blobService = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim()
  ? BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING)
  : new BlobServiceClient(accountUrl, new DefaultAzureCredential());
const container = blobService.getContainerClient(containerName);
for (const object of bundle.bannerObjects.filter((item) => !existingPaths.has(`courseBannerAssets/${item.assetId}`))) {
  const bytes = Buffer.from(object.base64, "base64");
  await container.getBlockBlobClient(`course-banners/${object.assetId}.webp`).uploadData(bytes, {
    blobHTTPHeaders: { blobContentType: object.contentType },
    conditions: { ifNoneMatch: "*" },
  });
}

const client = await pool.connect();
try {
  await client.query("BEGIN");
  for (const document of documentsToInsert) {
    const segments = document.path.split("/");
    if (!document.path || segments.length % 2 !== 0) throw new Error(`Invalid document path: ${document.path}`);
    const data = expectedDocumentData(document);
    await client.query(
      `INSERT INTO filosage_documents (path, collection_id, collection_path, document_id, data)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [document.path, segments.at(-2), segments.slice(0, -1).join("/"), segments.at(-1), JSON.stringify(data)],
    );
  }
  await client.query("COMMIT");
  console.log(`Imported ${documentsToInsert.length} missing document(s) into Azure; ${existingPaths.size} exact existing document(s) were preserved.`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
