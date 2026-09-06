/** Run with node --conditions=react-server --import tsx; defaults to dry-run.
 * --apply is an explicit maintenance mutation. No scheduler is installed. */
import { listCollectionDocumentsPage, listCollectionGroupDocumentsByField } from "../src/lib/document-store";
import { reconcileExpiredAiUsage } from "../src/lib/ai-usage";
import { reconcileGenerationOperation, type GenerationOperation } from "../src/lib/generation-operations";

const apply = process.argv.includes("--apply");
const unknown = process.argv.slice(2).filter((arg) => arg !== "--apply" && arg !== "--dry-run");
if (unknown.length) throw new Error("Usage: reconcile-generation-operations.ts [--dry-run|--apply]");
let pageToken: string | undefined;
let examined = 0;
let changed = 0;
let blocked = 0;
const deadline = Date.now() + 50_000;
let timedOut = false;
for (const collection of ["generationOperations", "aiRequests"]) {
pageToken = undefined;
do {
  const page = await listCollectionDocumentsPage(collection, { limit: 100, afterId: pageToken });
  for (const item of page.documents) {
    examined += 1;
    try {
      const result = collection === "generationOperations"
        ? await reconcileGenerationOperation(item as unknown as GenerationOperation, apply)
        : { operationId: item.id, action: await reconcileExpiredAiUsage(item.id, apply) };
      if (result.action === "manual_reconciliation_required") { blocked += 1; console.error(JSON.stringify(result)); }
      else if (result.action !== "none") { changed += 1; console.log(JSON.stringify(result)); }
    } catch {
      blocked += 1;
      // Do not print private request bodies, prompts, UIDs, or provider errors.
      console.error(JSON.stringify({ operationId: item.operationId, action: "blocked", reason: "concurrent_change_or_account_lifecycle" }));
    }
    if (Date.now() >= deadline) { timedOut = true; break; }
  }
  pageToken = page.nextAfterId ?? undefined;
} while (pageToken && Date.now() < deadline);
if (Date.now() >= deadline) { timedOut = true; break; }
}
// Older claims cannot be matched safely to a request without the old key.
// Surface them as an explicit cutover obligation, never guess a refund.
if (!timedOut) {
  const claims = await listCollectionGroupDocumentsByField("courseCreditClaims", "status", "reserved", 300);
  for (const claim of claims.filter((item) => !item.operationId)) {
    blocked += 1;
    console.error(JSON.stringify({ claimId: claim.claimId ?? claim.id, action: "manual_reconciliation_required" }));
  }
  if (claims.length >= 300) timedOut = true;
}
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", examined, changed, blocked, remaining: Boolean(pageToken) || timedOut }));
if (blocked || pageToken || timedOut) process.exitCode = 1;
