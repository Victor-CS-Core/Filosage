import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { RETIRED_SYSTEM_NAMES } from "./fixtures/retired-system-names";
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

  expect(declared.length).toBeGreaterThan(0);
  for (const required of declared) {
    expect(required.collectionGroup).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(required.fieldPath).toMatch(/^[A-Za-z0-9_.]+$/);
    expect(required.fieldPath).toBe(
      required.collectionGroup === "lessonNotes" ? "key" : "courseId",
    );
  }
});

test("retired datastore index and rules files are not part of the Azure runtime", () => {
  expect(existsSync(`${RETIRED_SYSTEM_NAMES[2]}.json`)).toBe(false);
  expect(existsSync(`${RETIRED_SYSTEM_NAMES[1]}.rules`)).toBe(false);
  expect(existsSync(`${RETIRED_SYSTEM_NAMES[1]}.indexes.json`)).toBe(false);
});

test("production health copy names Azure PostgreSQL and keeps SITE_VERSION", async () => {
  const health = await readFile("src/app/api/health/route.ts", "utf8");
  expect(health).toContain("Azure PostgreSQL document store");
  expect(health).toContain("SITE_VERSION");
  expect(health).toContain("GITHUB_SHA");
  expect(health).not.toContain(RETIRED_SYSTEM_NAMES[1]);
  expect(health).not.toContain("CF_PAGES_COMMIT_SHA");
  expect(health).not.toContain("VERCEL_GIT_COMMIT_SHA");
});
