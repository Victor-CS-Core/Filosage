import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { COURSE_DELETION_COLLECTION_GROUP_INDEXES } from "../src/lib/course-deletion";

interface FirestoreIndexConfig {
  fieldOverrides?: Array<{
    collectionGroup: string;
    fieldPath: string;
    indexes?: Array<{
      order?: "ASCENDING" | "DESCENDING";
      queryScope?: "COLLECTION" | "COLLECTION_GROUP";
    }>;
  }>;
}

test("declares every collection-group index required by course deletion", async () => {
  const config = JSON.parse(await readFile("firestore.indexes.json", "utf8")) as FirestoreIndexConfig;

  for (const required of COURSE_DELETION_COLLECTION_GROUP_INDEXES) {
    const override = config.fieldOverrides?.find((candidate) =>
      candidate.collectionGroup === required.collectionGroup
      && candidate.fieldPath === required.fieldPath,
    );
    expect(override, `${required.collectionGroup}.${required.fieldPath} needs a field override.`).toBeDefined();

    const collectionGroupOrders = new Set(
      override?.indexes
        ?.filter((index) => index.queryScope === "COLLECTION_GROUP")
        .map((index) => index.order),
    );
    expect(collectionGroupOrders).toEqual(new Set(["ASCENDING", "DESCENDING"]));
  }
});
