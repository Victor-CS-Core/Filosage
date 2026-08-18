import {
  deleteStoredDocuments,
  listCollectionDocumentsPage,
} from "../src/lib/firebase-server.ts";
import { identityIntentPathsToPrune } from "../src/lib/identity-link-server.ts";
import {
  assertIdentityMaintenanceWriteTarget,
  identityMaintenanceTarget,
} from "./identity-maintenance-safety.ts";

const apply = process.argv.includes("--apply");
const retentionConfirmed = process.argv.includes("--confirm-30-day-retention");
if (apply && !retentionConfirmed) {
  throw new Error("Prune write mode requires --confirm-30-day-retention.");
}
if (apply) {
  assertIdentityMaintenanceWriteTarget(process.argv, identityMaintenanceTarget());
}

const paths: string[] = [];
let afterId: string | undefined;
do {
  const page = await listCollectionDocumentsPage(
    "identityLinkIntents",
    { limit: 250, afterId },
  );
  paths.push(...identityIntentPathsToPrune(page.documents));
  afterId = page.nextAfterId ?? undefined;
} while (afterId);

console.log(JSON.stringify({
  mode: apply ? "write" : "dry-run",
  eligible: paths.length,
  retentionDays: 30,
}));
if (!apply) process.exit(0);

for (let offset = 0; offset < paths.length; offset += 250) {
  await deleteStoredDocuments(paths.slice(offset, offset + 250));
}
console.log(JSON.stringify({ mode: "write", pruned: paths.length, completed: true }));
