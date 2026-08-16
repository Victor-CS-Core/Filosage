import type { ProductEventName } from "@/lib/product-events";

export interface ProductMetricEvent {
  id?: string;
  event?: ProductEventName | string;
  actorId?: string;
  sessionId?: string;
  createdAt?: unknown;
}

export interface FunnelStep {
  event: ProductEventName;
  label: string;
  events: number;
  uniqueActors: number;
  conversionFromPrevious: number | null;
}

const ACQUISITION_FUNNEL = [
  { event: "landing_viewed", label: "Landing viewed" },
  { event: "course_discovered", label: "Course discovered" },
  { event: "signup_started", label: "Signup started" },
] as const satisfies ReadonlyArray<{ event: ProductEventName; label: string }>;

const ACTIVATION_FUNNEL = [
  { event: "signup_completed", label: "Signup completed" },
  { event: "course_started", label: "Course started" },
  { event: "first_practice_completed", label: "First practice completed" },
  { event: "criterion_demonstrated", label: "Criterion demonstrated" },
  { event: "evidence_report_viewed", label: "Evidence report viewed" },
] as const satisfies ReadonlyArray<{ event: ProductEventName; label: string }>;

const MEANINGFUL_RETURN_EVENTS = new Set<ProductEventName>([
  "lesson_started",
  "review_completed",
  "retrieval_attempted",
  "transfer_attempted",
  "criterion_demonstrated",
  "evidence_report_viewed",
]);

function timestamp(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const parsed = typeof value === "number" ? value : Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (value && typeof value === "object") {
    const candidate = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof candidate.toDate === "function") return candidate.toDate().getTime();
    const seconds = candidate.seconds ?? candidate._seconds;
    if (typeof seconds === "number") return seconds * 1_000;
  }
  return undefined;
}

function percent(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 1_000) / 10 : 0;
}

function orderedFunnel(
  records: ProductMetricEvent[],
  definition: ReadonlyArray<{ event: ProductEventName; label: string }>,
  identity: "actorId" | "sessionId",
) {
  let eligible: Map<string, number> | undefined;
  return definition.map(({ event, label }, index): FunnelStep => {
    const matching = records.filter((record) => record.event === event);
    const firstByIdentity = new Map<string, number>();
    for (const record of matching) {
      const id = record[identity];
      const at = timestamp(record.createdAt);
      if (!id || at === undefined) continue;
      firstByIdentity.set(id, Math.min(firstByIdentity.get(id) ?? at, at));
    }
    const previous = eligible?.size ?? 0;
    const progressing = eligible
      ? new Map(Array.from(firstByIdentity).filter(([id, at]) => {
          const prior = eligible?.get(id);
          return prior !== undefined && at >= prior;
        }))
      : firstByIdentity;
    eligible = progressing;
    return {
      event,
      label,
      events: matching.length,
      uniqueActors: progressing.size,
      conversionFromPrevious: index === 0 || previous === 0
        ? null
        : percent(progressing.size, previous),
    };
  });
}

export function buildMarketingFunnels(records: ProductMetricEvent[]) {
  const courseToPractice = orderedFunnel(records, [
    { event: "course_started", label: "Course started" },
    { event: "first_practice_completed", label: "First practice completed" },
  ], "actorId");
  const courseStarters = courseToPractice[0]?.uniqueActors ?? 0;
  const practiceCompleters = courseToPractice[1]?.uniqueActors ?? 0;
  return {
    acquisition: orderedFunnel(records, ACQUISITION_FUNNEL, "sessionId"),
    activation: orderedFunnel(records, ACTIVATION_FUNNEL, "actorId"),
    existingAccountActivation: {
      courseStarters,
      practiceCompleters,
      percent: percent(practiceCompleters, courseStarters),
    },
  };
}

export function retentionAtDay(
  records: ProductMetricEvent[],
  day: number,
  now: Date = new Date(),
  ownerUid?: string,
) {
  const dayMs = 86_400_000;
  const activations = new Map<string, number>();
  for (const record of records) {
    if (record.event !== "first_practice_completed" || !record.actorId || record.actorId === ownerUid) continue;
    const at = timestamp(record.createdAt);
    if (at === undefined) continue;
    activations.set(record.actorId, Math.min(activations.get(record.actorId) ?? at, at));
  }
  const eligible = Array.from(activations).filter(([, activation]) => (
    activation <= now.getTime() - (day + 1) * dayMs
  ));
  const returned = eligible.filter(([actorId, activation]) => {
    const windowStart = activation + (day - 1) * dayMs;
    const windowEnd = activation + (day + 1) * dayMs;
    return records.some((record) => {
      if (record.actorId !== actorId || !MEANINGFUL_RETURN_EVENTS.has(record.event as ProductEventName)) return false;
      const at = timestamp(record.createdAt);
      return at !== undefined && at > activation && at >= windowStart && at < windowEnd;
    });
  }).length;
  return { eligible: eligible.length, returned, percent: percent(returned, eligible.length) };
}

export function orderedIntentCompletion(
  records: ProductMetricEvent[],
  intentEvent: ProductEventName,
  completionEvent: ProductEventName,
) {
  const intentByActor = new Map<string, number>();
  const completionByActor = new Map<string, number>();
  for (const record of records) {
    if (!record.actorId || (record.event !== intentEvent && record.event !== completionEvent)) continue;
    const at = timestamp(record.createdAt);
    if (at === undefined) continue;
    const target = record.event === intentEvent ? intentByActor : completionByActor;
    target.set(record.actorId, Math.min(target.get(record.actorId) ?? at, at));
  }
  const completionActors = Array.from(intentByActor).filter(([actorId, intentAt]) => {
    const completionAt = completionByActor.get(actorId);
    return completionAt !== undefined && completionAt >= intentAt;
  }).length;
  return {
    intentActors: intentByActor.size,
    completionActors,
    percent: percent(completionActors, intentByActor.size),
  };
}
