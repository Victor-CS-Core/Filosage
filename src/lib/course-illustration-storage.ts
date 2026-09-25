import "server-only";

import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { serverEnvironment } from "@/lib/runtime-environment";

const OBJECT_PREFIX = "course-illustrations";

let service: BlobServiceClient | null = null;
let serviceKey = "";

function blobService() {
  const connectionString = serverEnvironment.AZURE_STORAGE_CONNECTION_STRING?.trim();
  const accountUrl = serverEnvironment.AZURE_STORAGE_ACCOUNT_URL?.trim();
  const key = connectionString || accountUrl || "";
  if (!key) return null;
  if (!service || serviceKey !== key) {
    service = connectionString
      ? BlobServiceClient.fromConnectionString(connectionString)
      : new BlobServiceClient(accountUrl!, new DefaultAzureCredential());
    serviceKey = key;
  }
  return service;
}

function containerName() {
  return serverEnvironment.AZURE_STORAGE_ILLUSTRATION_CONTAINER?.trim() || "course-illustrations";
}

function objectKey(assetId: string) {
  return `${OBJECT_PREFIX}/${assetId}.webp`;
}

export async function storeCourseIllustrationObject(assetId: string, bytes: Uint8Array) {
  const client = blobService();
  if (!client) return null;
  const blob = client.getContainerClient(containerName()).getBlockBlobClient(objectKey(assetId));
  await blob.uploadData(bytes, {
    blobHTTPHeaders: {
      blobContentType: "image/webp",
      blobCacheControl: "public, max-age=31536000, immutable",
    },
  });
  return "azure-blob" as const;
}

export async function readCourseIllustrationObject(assetId: string) {
  const client = blobService();
  if (!client) return null;
  const blob = client.getContainerClient(containerName()).getBlockBlobClient(objectKey(assetId));
  const response = await blob.download();
  if (!response.readableStreamBody) return null;
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.readableStreamBody) {
    chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
  }
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  if (!length) return null;
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

// Caller proves the asset is exclusive and no surviving course references it.
// Azure deletion is idempotent; an unknown remote result keeps the durable job.
export async function deleteExclusiveCourseIllustrationObject(assetId: string, asset: Record<string, unknown>) {
  if (!/^[a-f0-9]{32}$/.test(assetId) || asset.ownership !== "exclusive" || typeof asset.ownerUid !== "string") throw new Error("Illustration ownership is unverified.");
  if (asset.storage !== "azure-blob") return;
  const client = blobService();
  if (!client) throw new Error("Illustration storage is unavailable for deletion.");
  await client.getContainerClient(containerName()).getBlockBlobClient(objectKey(assetId)).deleteIfExists();
}
