import "server-only";

export const SPARK_RAW_TURN_RETENTION_DAYS = 30;

export interface SparkRetentionTurn extends Record<string, unknown> {
  id: string;
}

export function expiredSparkTurnPaths(records: SparkRetentionTurn[], now = Date.now()) {
  return records.flatMap((record) => {
    const expiresAt = typeof record.expiresAt === "string" ? Date.parse(record.expiresAt) : Number.NaN;
    return Number.isFinite(expiresAt) && expiresAt <= now && /^[A-Za-z0-9_-]{1,200}$/.test(record.id)
      ? [`sparkTurns/${record.id}`]
      : [];
  });
}