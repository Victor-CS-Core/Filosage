export const FIRESTORE_PRICING = {
  readPer100kUsd: 0.03,
  writePer100kUsd: 0.09,
  deletePer100kUsd: 0.01,
  dataStoragePerGibMonthUsd: 0.15,
  backupStoragePerGibMonthUsd: 0.03,
  pitrStoragePerGibMonthUsd: 0.15,
  dailyFreeReads: 50_000,
  dailyFreeWrites: 20_000,
  dailyFreeDeletes: 20_000,
  freeStorageBytes: 2 ** 30,
} as const;

function usd(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function estimateFirestoreCost(input: {
  reads: number;
  writes: number;
  deletes: number;
  dataStorageBytes: number;
  backupStorageBytes: number;
  pitrStorageBytes: number;
  elapsedDays: number;
  daysInMonth: number;
}) {
  const gib = 2 ** 30;
  const monthFraction = input.elapsedDays / input.daysInMonth;
  const reads = Math.max(0, input.reads - FIRESTORE_PRICING.dailyFreeReads * input.elapsedDays);
  const writes = Math.max(0, input.writes - FIRESTORE_PRICING.dailyFreeWrites * input.elapsedDays);
  const deletes = Math.max(0, input.deletes - FIRESTORE_PRICING.dailyFreeDeletes * input.elapsedDays);
  const dataStorageGib = Math.max(0, input.dataStorageBytes - FIRESTORE_PRICING.freeStorageBytes) / gib;
  return usd(
    (reads / 100_000) * FIRESTORE_PRICING.readPer100kUsd
    + (writes / 100_000) * FIRESTORE_PRICING.writePer100kUsd
    + (deletes / 100_000) * FIRESTORE_PRICING.deletePer100kUsd
    + dataStorageGib * FIRESTORE_PRICING.dataStoragePerGibMonthUsd * monthFraction
    + (input.backupStorageBytes / gib) * FIRESTORE_PRICING.backupStoragePerGibMonthUsd * monthFraction
    + (input.pitrStorageBytes / gib) * FIRESTORE_PRICING.pitrStoragePerGibMonthUsd * monthFraction,
  );
}
