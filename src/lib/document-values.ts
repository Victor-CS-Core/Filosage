export interface DocumentValue {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  timestampValue?: string;
  stringValue?: string;
  referenceValue?: string;
  arrayValue?: { values?: DocumentValue[] };
  mapValue?: { fields?: Record<string, DocumentValue> };
}

export interface DocumentRecord {
  name: string;
  fields?: Record<string, DocumentValue>;
}

export function toDocumentValue(value: unknown): DocumentValue {
  if (value === null) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toDocumentValue) } };
  }
  if (typeof value === "object") {
    return { mapValue: { fields: toDocumentFields(value as Record<string, unknown>) } };
  }
  throw new Error(`Unsupported document value: ${typeof value}`);
}

export function toDocumentFields(data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, toDocumentValue(value)]),
  );
}

export function fromDocumentValue(value: DocumentValue): unknown {
  if ("nullValue" in value) return null;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.timestampValue !== undefined) return value.timestampValue;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.referenceValue !== undefined) return value.referenceValue;
  if (value.arrayValue !== undefined) {
    return (value.arrayValue.values ?? []).map(fromDocumentValue);
  }
  if (value.mapValue !== undefined) return fromDocumentFields(value.mapValue.fields ?? {});
  return null;
}

export function fromDocumentFields(fields: Record<string, DocumentValue>) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, fromDocumentValue(value)]),
  );
}
