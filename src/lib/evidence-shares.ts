import "server-only";

import {
  getCourse,
  getStoredDocument,
  listAllStoredDocuments,
  runStoredDocumentTransaction,
} from "@/lib/firebase-server";
import type { EvidenceReportV1 } from "@/lib/evidence-report";

const SHARE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;

interface StoredEvidenceShare {
  version: 1;
  ownerUid: string;
  courseId: string;
  snapshot: EvidenceReportV1;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
}

export interface EvidenceShareSummary {
  id: string;
  courseId: string;
  courseTopic: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  status: "active" | "expired" | "revoked";
}

function randomShareToken() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
}

async function tokenDigest(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`filosage-evidence-share-v1:${token}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function shareStatus(value: { expiresAt: string; revokedAt?: string }, now = Date.now()): EvidenceShareSummary["status"] {
  if (value.revokedAt) return "revoked";
  return Date.parse(value.expiresAt) <= now ? "expired" : "active";
}

export async function createEvidenceShare(uid: string, courseId: string, report: EvidenceReportV1) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = randomShareToken();
    const id = await tokenDigest(token);
    const sharePath = `evidenceShares/${id}`;
    const referencePath = `users/${uid}/evidenceShareRefs/${id}`;
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + SHARE_LIFETIME_MS).toISOString();
    const created = await runStoredDocumentTransaction([sharePath, referencePath], (documents) => {
      if (documents[sharePath] || documents[referencePath]) return { writes: [], result: false };
      const share: StoredEvidenceShare = {
        version: 1,
        ownerUid: uid,
        courseId,
        snapshot: report,
        createdAt,
        expiresAt,
      };
      return {
        writes: [
          { path: sharePath, data: share as unknown as Record<string, unknown> },
          {
            path: referencePath,
            data: {
              shareId: id,
              courseId,
              courseTopic: report.course.topic,
              createdAt,
              expiresAt,
            },
          },
        ],
        result: true,
      };
    });
    if (created) return { id, token, path: `/evidence/shared/${token}`, expiresAt };
  }
  throw new Error("A unique evidence-share token could not be created.");
}

export async function listEvidenceShares(uid: string, courseId?: string): Promise<EvidenceShareSummary[]> {
  const records = await listAllStoredDocuments(`users/${uid}/evidenceShareRefs`, 200);
  return records.flatMap((record) => {
    const id = typeof record.shareId === "string" ? record.shareId : String(record.id ?? "");
    const recordCourseId = typeof record.courseId === "string" ? record.courseId : "";
    const createdAt = typeof record.createdAt === "string" ? record.createdAt : "";
    const expiresAt = typeof record.expiresAt === "string" ? record.expiresAt : "";
    const revokedAt = typeof record.revokedAt === "string" ? record.revokedAt : undefined;
    if (!/^[a-f0-9]{64}$/.test(id) || !recordCourseId || !createdAt || !expiresAt || (courseId && recordCourseId !== courseId)) return [];
    return [{
      id,
      courseId: recordCourseId,
      courseTopic: typeof record.courseTopic === "string" ? record.courseTopic : "Evidence report",
      createdAt,
      expiresAt,
      ...(revokedAt ? { revokedAt } : {}),
      status: shareStatus({ expiresAt, revokedAt }),
    }];
  }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function revokeEvidenceShare(uid: string, shareId: string) {
  if (!/^[a-f0-9]{64}$/.test(shareId)) return false;
  const sharePath = `evidenceShares/${shareId}`;
  const referencePath = `users/${uid}/evidenceShareRefs/${shareId}`;
  return runStoredDocumentTransaction([sharePath, referencePath], (documents) => {
    const share = documents[sharePath];
    const reference = documents[referencePath];
    if (!share || !reference || share.ownerUid !== uid) return { writes: [], result: false };
    const revokedAt = typeof share.revokedAt === "string" ? share.revokedAt : new Date().toISOString();
    return {
      writes: [
        { path: sharePath, data: { ...share, revokedAt } },
        { path: referencePath, data: { ...reference, revokedAt } },
      ],
      result: true,
    };
  });
}

export async function readEvidenceShare(token: string): Promise<EvidenceReportV1 | null> {
  const validToken = /^[A-Za-z0-9_-]{43}$/.test(token);
  const id = await tokenDigest(validToken ? token : "invalid-token");
  const share = await getStoredDocument(`evidenceShares/${id}`);
  const ownerUid = typeof share?.ownerUid === "string" ? share.ownerUid : "unavailable";
  const courseId = typeof share?.courseId === "string" ? share.courseId : "unavailable";
  const [owner, course] = await Promise.all([
    getStoredDocument(`users/${ownerUid}`),
    getCourse(courseId),
  ]);
  const expiresAt = typeof share?.expiresAt === "string" ? Date.parse(share.expiresAt) : 0;
  const available = validToken
    && share?.version === 1
    && !share.revokedAt
    && expiresAt > Date.now()
    && Boolean(owner)
    && owner?.accountStatus !== "suspended"
    && owner?.accountDeletionInProgress !== true
    && Boolean(course)
    && course?.moderationStatus !== "quarantined"
    && share.snapshot
    && typeof share.snapshot === "object";
  return available ? share.snapshot as unknown as EvidenceReportV1 : null;
}
