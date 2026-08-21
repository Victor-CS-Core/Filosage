import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  COURSE_DELETION_COLLECTION_GROUP_INDEXES,
  COURSE_SCOPED_COLLECTION_GROUPS,
} from "../src/lib/course-deletion";

test("course deletion collection-group queries are covered by the Azure PostgreSQL document store", async () => {
  const schema = await readFile("infra/azure/database/001_document_store.sql", "utf8");
  expect(schema).toContain("filosage_documents_collection_id_idx");
  expect(schema).toContain("USING gin (data jsonb_path_ops)");

  const requiredGroups = new Set<string>([
    ...Object.values(COURSE_SCOPED_COLLECTION_GROUPS),
    "lessonNotes",
  ]);
  const declared = COURSE_DELETION_COLLECTION_GROUP_INDEXES;
  const declaredGroups = declared.map((entry) => entry.collectionGroup).sort();
  expect(declaredGroups).toEqual([...requiredGroups].sort());

  for (const required of declared) {
    expect(required.fieldPath).toBe(
      required.collectionGroup === "lessonNotes" ? "key" : "courseId",
    );
  }
});

test("legacy Firebase index and rules files are not part of the Azure runtime", () => {
  expect(existsSync("firebase.json")).toBe(false);
  expect(existsSync("firestore.rules")).toBe(false);
  expect(existsSync("firestore.indexes.json")).toBe(false);
});

test("production health copy names Azure PostgreSQL and keeps SITE_VERSION", async () => {
  const health = await readFile("src/app/api/health/route.ts", "utf8");
  expect(health).toContain("Azure PostgreSQL document store");
  expect(health).toContain("SITE_VERSION");
  expect(health).toContain("GITHUB_SHA");
  expect(health).not.toContain("Firestore");
  expect(health).not.toContain("CF_PAGES_COMMIT_SHA");
  expect(health).not.toContain("VERCEL_GIT_COMMIT_SHA");
});
