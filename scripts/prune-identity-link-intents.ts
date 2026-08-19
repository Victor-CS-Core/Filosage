import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { identityIntentPathsToPrune } from "../src/lib/identity-link-policy.ts";
import {
  assertIdentityMaintenanceWriteTarget,
  identityMaintenanceTarget,
} from "./identity-maintenance-safety.ts";

interface MaintenanceIntent extends Record<string, unknown> {
  id: string;
}

interface MaintenanceIntentPage {
  documents: MaintenanceIntent[];
  inspected: number;
  hasMore: boolean;
  nextAfterId: string | null;
}

export interface PruneIdentityLinkIntentsDependencies {
  deleteStoredDocuments(paths: string[]): Promise<void>;
  listCollectionDocumentsPage(
    collectionId: string,
    options: { limit: number; afterId?: string },
  ): Promise<MaintenanceIntentPage>;
  now(): number;
  writeOutput(line: string): void;
}

export async function pruneIdentityLinkIntentsMain(
  args: string[],
  env: Record<string, string | undefined>,
  dependencies: PruneIdentityLinkIntentsDependencies,
) {
  const apply = args.includes("--apply");
  if (apply && !args.includes("--confirm-30-day-retention")) {
    throw new Error("Prune write mode requires --confirm-30-day-retention.");
  }
  if (apply) {
    assertIdentityMaintenanceWriteTarget(args, identityMaintenanceTarget(env), env);
  }

  const paths: string[] = [];
  const now = dependencies.now();
  let afterId: string | undefined;
  do {
    const page = await dependencies.listCollectionDocumentsPage(
      "identityLinkIntents",
      { limit: 250, afterId },
    );
    paths.push(...identityIntentPathsToPrune(page.documents, now));
    afterId = page.nextAfterId ?? undefined;
  } while (afterId);

  dependencies.writeOutput(JSON.stringify({
    mode: apply ? "write" : "dry-run",
    eligible: paths.length,
    retentionDays: 30,
  }));
  if (!apply) {
    return {
      mode: "dry-run" as const,
      eligible: paths.length,
      retentionDays: 30 as const,
      pruned: 0,
      completed: true,
    };
  }

  for (let offset = 0; offset < paths.length; offset += 250) {
    await dependencies.deleteStoredDocuments(paths.slice(offset, offset + 250));
  }
  const summary = {
    mode: "write" as const,
    eligible: paths.length,
    retentionDays: 30 as const,
    pruned: paths.length,
    completed: true,
  };
  dependencies.writeOutput(JSON.stringify(summary));
  return summary;
}

async function runPruneIdentityLinkIntentsCli() {
  const store = await import("../src/lib/firebase-server.ts");
  await pruneIdentityLinkIntentsMain(process.argv.slice(2), process.env, {
    deleteStoredDocuments: store.deleteStoredDocuments,
    listCollectionDocumentsPage: store.listCollectionDocumentsPage,
    now: () => Date.now(),
    writeOutput: (line) => console.log(line),
  });
}

const directScript = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;
if (directScript) await runPruneIdentityLinkIntentsCli();
