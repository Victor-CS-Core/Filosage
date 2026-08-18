import {
  getStoredDocument,
  listCollectionDocumentsPage,
  runStoredDocumentTransaction,
} from "../src/lib/firebase-server.ts";
import {
  identityRegistrationWrites,
  planIdentityBackfill,
} from "../src/lib/identity-link-server.ts";
import {
  assertIdentityMaintenanceWriteTarget,
  identityMaintenanceTarget,
} from "./identity-maintenance-safety.ts";

const apply = process.argv.includes("--apply");
const missingOnly = process.argv.includes("--missing-only");
if (apply && !missingOnly) {
  throw new Error("Write mode requires --apply --missing-only.");
}
if (apply) {
  assertIdentityMaintenanceWriteTarget(process.argv, identityMaintenanceTarget());
}

const accounts: Array<{ uid: string; email: string }> = [];
let afterId: string | undefined;
do {
  const page = await listCollectionDocumentsPage("users", { limit: 250, afterId });
  for (const record of page.documents) {
    accounts.push({
      uid: typeof record.uid === "string" && record.uid.trim()
        ? record.uid.trim()
        : record.id,
      email: typeof record.email === "string" ? record.email : "",
    });
  }
  afterId = page.nextAfterId ?? undefined;
} while (afterId);

const plannedAt = new Date().toISOString();
const preliminary = await planIdentityBackfill(accounts, {}, undefined, plannedAt);
const existingEntries = await Promise.all(preliminary.candidates.flatMap(({ registration }) => (
  [registration.identityPath, registration.emailPath].map(async (path) => (
    [path, await getStoredDocument(path)] as const
  ))
)));
const plan = await planIdentityBackfill(
  accounts,
  Object.fromEntries(existingEntries),
  undefined,
  plannedAt,
);
console.log(JSON.stringify({
  mode: apply ? "write" : "dry-run",
  counts: plan.counts,
  errors: plan.errors.length,
}));
if (plan.errors.length || plan.counts.invalid) {
  throw new Error("Identity registry preflight failed; no registry writes were attempted.");
}
if (!apply) {
  console.log("Dry run complete. Write mode remains approval-gated.");
  process.exit(0);
}

for (const { registration } of plan.candidates) {
  await runStoredDocumentTransaction(
    [registration.identityPath, registration.emailPath],
    (documents) => ({
      writes: identityRegistrationWrites(
        documents,
        registration,
        plannedAt,
        { allowNewExternalAccounts: false },
      ),
      result: undefined,
    }),
  );
}
console.log(JSON.stringify({
  mode: "write",
  accounts: plan.candidates.length,
  completed: true,
}));
