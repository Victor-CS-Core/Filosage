import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { COURSE_DELETION_COLLECTION_GROUP_INDEXES } from "../src/lib/course-deletion";

test("PostgreSQL document indexes cover every course-deletion collection group", async () => {
  const schema = await readFile("infra/azure/database/001_document_store.sql", "utf8");
  expect(schema).toContain("filosage_documents_collection_id_idx");
  expect(schema).toContain("USING gin (data jsonb_path_ops)");
  expect(COURSE_DELETION_COLLECTION_GROUP_INDEXES.length).toBeGreaterThan(0);
  for (const required of COURSE_DELETION_COLLECTION_GROUP_INDEXES) {
    expect(required.collectionGroup).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(required.fieldPath).toMatch(/^[A-Za-z0-9_.]+$/);
  }
});
