const SERIALIZED_CRITERION_SEPARATOR = /"\s*,\s*"/;

export function containsSerializedCriterionList(value: string) {
  return SERIALIZED_CRITERION_SEPARATOR.test(value);
}

export function normalizeSuccessCriteria(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item !== "string") return [];
    return item
      .split(SERIALIZED_CRITERION_SEPARATOR)
      .map((criterion) => criterion.trim().replace(/^"+|"+$/g, ""))
      .filter(Boolean);
  });
}
