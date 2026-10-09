import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expiredSparkTurnPaths, SPARK_RAW_TURN_RETENTION_DAYS, type SparkRetentionTurn } from "../src/lib/spark/retention.ts";

interface SparkTurnPage {
  documents: SparkRetentionTurn[];
  nextAfterId: string | null;
}

export interface PruneSparkTurnsDependencies {
  deleteStoredDocuments(paths: string[]): Promise<void>;
  listCollectionDocumentsPage(
    collectionId: string,
    options: { limit: number; afterId?: string },
  ): Promise<SparkTurnPage>;
  now(): number;
  writeOutput(line: string): void;
}

export async function pruneSparkTurnsMain(args: string[], dependencies: PruneSparkTurnsDependencies) {
  const apply = args.includes("--apply");
  if (apply && !args.includes("--confirm-30-day-retention")) {
    throw new Error("Spark turn pruning requires --confirm-30-day-retention in write mode.");
  }

  const paths: string[] = [];
  let afterId: string | undefined;
  do {
    const page = await dependencies.listCollectionDocumentsPage("sparkTurns", { limit: 250, afterId });
    paths.push(...expiredSparkTurnPaths(page.documents, dependencies.now()));
    afterId = page.nextAfterId ?? undefined;
  } while (afterId);

  const summary = {
    mode: apply ? "write" as const : "dry-run" as const,
    eligible: paths.length,
    retentionDays: SPARK_RAW_TURN_RETENTION_DAYS,
    pruned: apply ? paths.length : 0,
  };
  dependencies.writeOutput(JSON.stringify(summary));
  if (!apply) return summary;

  for (let offset = 0; offset < paths.length; offset += 250) {
    await dependencies.deleteStoredDocuments(paths.slice(offset, offset + 250));
  }
  return summary;
}

async function runPruneSparkTurnsCli() {
  const store = await import("../src/lib/document-store.ts");
  await pruneSparkTurnsMain(process.argv.slice(2), {
    deleteStoredDocuments: store.deleteStoredDocuments,
    listCollectionDocumentsPage: store.listCollectionDocumentsPage,
    now: () => Date.now(),
    writeOutput: (line) => console.log(line),
  });
}

const directScript = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;
if (directScript) await runPruneSparkTurnsCli();