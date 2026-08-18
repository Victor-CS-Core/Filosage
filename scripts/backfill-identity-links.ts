import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  type BackfillAccountInput,
  IdentityBackfillTransactionConflictError,
  type IdentityBackfillPlan,
  type IdentityBackfillTransactionResult,
  identityBackfillTransactionPlan,
  type IdentityRegistryDocument,
  type RegistryWrite,
} from "../src/lib/identity-link-policy.ts";
import {
  assertIdentityMaintenanceWriteTarget,
  identityMaintenanceTarget,
} from "./identity-maintenance-safety.ts";

interface MaintenanceDocument extends Record<string, unknown> {
  id: string;
}

interface MaintenanceDocumentPage {
  documents: MaintenanceDocument[];
  inspected: number;
  hasMore: boolean;
  nextAfterId: string | null;
}

export interface BackfillIdentityLinksDependencies {
  getStoredDocument(path: string): Promise<Record<string, unknown> | null>;
  listCollectionDocumentsPage(
    collectionId: string,
    options: { limit: number; afterId?: string },
  ): Promise<MaintenanceDocumentPage>;
  planIdentityBackfill(
    accounts: BackfillAccountInput[],
    existing: Record<string, Record<string, unknown> | null>,
    explicit?: string,
    now?: string,
  ): Promise<IdentityBackfillPlan>;
  runStoredDocumentTransaction(
    paths: string[],
    update: (documents: Record<string, IdentityRegistryDocument>) => {
      writes: RegistryWrite[];
      result: IdentityBackfillTransactionResult;
    },
  ): Promise<IdentityBackfillTransactionResult>;
  now(): string;
  writeOutput(line: string): void;
}

function accountFromUserDocument(record: MaintenanceDocument): BackfillAccountInput {
  const hasStoredUid = Object.hasOwn(record, "uid");
  const storedUidMatches = !hasStoredUid
    || (typeof record.uid === "string" && record.uid === record.id);
  return {
    uid: storedUidMatches ? record.id : "",
    email: typeof record.email === "string" ? record.email : "",
  };
}

export async function backfillIdentityLinksMain(
  args: string[],
  env: Record<string, string | undefined>,
  dependencies: BackfillIdentityLinksDependencies,
) {
  const apply = args.includes("--apply");
  if (apply && !args.includes("--missing-only")) {
    throw new Error("Write mode requires --apply --missing-only.");
  }
  if (apply) {
    assertIdentityMaintenanceWriteTarget(args, identityMaintenanceTarget(env), env);
  }

  const accounts: BackfillAccountInput[] = [];
  let afterId: string | undefined;
  do {
    const page = await dependencies.listCollectionDocumentsPage(
      "users",
      { limit: 250, afterId },
    );
    accounts.push(...page.documents.map(accountFromUserDocument));
    afterId = page.nextAfterId ?? undefined;
  } while (afterId);

  const plannedAt = dependencies.now();
  const preliminary = await dependencies.planIdentityBackfill(
    accounts,
    {},
    undefined,
    plannedAt,
  );
  const existingEntries = await Promise.all(preliminary.candidates.flatMap(({ registration }) => (
    [registration.identityPath, registration.emailPath].map(async (path) => (
      [path, await dependencies.getStoredDocument(path)] as const
    ))
  )));
  const plan = await dependencies.planIdentityBackfill(
    accounts,
    Object.fromEntries(existingEntries),
    undefined,
    plannedAt,
  );
  dependencies.writeOutput(JSON.stringify({
    mode: apply ? "write" : "dry-run",
    counts: plan.counts,
    errors: plan.errors.length,
  }));
  if (plan.errors.length || plan.counts.invalid) {
    throw new Error("Identity registry preflight failed; no registry writes were attempted.");
  }
  if (!apply) {
    dependencies.writeOutput("Dry run complete. Write mode remains approval-gated.");
    return {
      mode: "dry-run" as const,
      counts: plan.counts,
      errors: 0,
      created: 0,
      exact: plan.counts.exact,
      conflicts: plan.counts.conflicts,
      completed: true,
    };
  }

  let created = 0;
  let exact = 0;
  let conflicts = 0;
  for (const { registration } of plan.candidates) {
    try {
      const result = await dependencies.runStoredDocumentTransaction(
        [registration.identityPath, registration.emailPath],
        (documents) => {
          const transaction = identityBackfillTransactionPlan(
            documents,
            registration,
            plannedAt,
          );
          return { writes: transaction.writes, result: transaction };
        },
      );
      created += result.created;
      exact += result.exact;
    } catch (error) {
      if (!(error instanceof IdentityBackfillTransactionConflictError)) throw error;
      created += error.created;
      exact += error.exact;
      conflicts += error.conflicts;
      dependencies.writeOutput(JSON.stringify({
        mode: "write",
        created,
        exact,
        conflicts,
        completed: false,
      }));
      throw new Error("Identity registry transaction conflict; the run stopped.", {
        cause: error,
      });
    }
  }
  const summary = {
    mode: "write" as const,
    created,
    exact,
    conflicts,
    completed: true,
  };
  dependencies.writeOutput(JSON.stringify(summary));
  return summary;
}

async function runBackfillIdentityLinksCli() {
  const [store, server] = await Promise.all([
    import("../src/lib/firebase-server.ts"),
    import("../src/lib/identity-link-server.ts"),
  ]);
  await backfillIdentityLinksMain(process.argv.slice(2), process.env, {
    getStoredDocument: store.getStoredDocument,
    listCollectionDocumentsPage: store.listCollectionDocumentsPage,
    planIdentityBackfill: server.planIdentityBackfill,
    runStoredDocumentTransaction: store.runStoredDocumentTransaction,
    now: () => new Date().toISOString(),
    writeOutput: (line) => console.log(line),
  });
}

const directScript = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;
if (directScript) await runBackfillIdentityLinksCli();
