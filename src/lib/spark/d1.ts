import "server-only";

import { getD1Database } from "@/lib/cloudflare-context";

export interface SparkD1Result {
  success: boolean;
  meta: { changes?: number; last_row_id?: number; rows_read?: number; rows_written?: number };
}

export interface SparkD1Statement {
  bind(...values: unknown[]): SparkD1Statement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<SparkD1Result>;
}

export interface SparkD1Database {
  prepare(query: string): SparkD1Statement;
  batch(statements: SparkD1Statement[]): Promise<SparkD1Result[]>;
}

export async function sparkD1(): Promise<SparkD1Database> {
  const database = await getD1Database();
  if (!database) throw new Error("SPARK_D1_UNAVAILABLE");
  return database as SparkD1Database;
}