import "server-only";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  fromFirestoreFields,
  toFirestoreFields,
  type FirestoreDocument,
  type FirestoreValue,
} from "@/lib/firestore-values";

/**
 * A development-only stand-in for the Firestore REST API, covering exactly the
 * request shapes firebase-server.ts issues: document get/list/patch/create,
 * runQuery (equality, AND composites, ranges, orderBy, limit),
 * runAggregationQuery (count), beginTransaction, and commit. Documents live in
 * a JSON file so state survives dev-server restarts.
 */

const STORE_PATH = join(process.cwd(), process.env.ERUDOZA_LOCAL_DIR ?? ".erudoza-local", "store.json");

type StoreShape = Record<string, Record<string, unknown>>;

let cache: StoreShape | null = null;

function load(): StoreShape {
  if (cache) return cache;
  try {
    cache = existsSync(STORE_PATH)
      ? JSON.parse(readFileSync(STORE_PATH, "utf8")) as StoreShape
      : {};
  } catch {
    cache = {};
  }
  return cache;
}

function persist() {
  if (!cache) return;
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(cache, null, 2));
}

function documentName(path: string) {
  return `projects/local/databases/(default)/documents/${path}`;
}

function pathFromName(name: string) {
  const marker = "/documents/";
  const index = name.indexOf(marker);
  return index >= 0 ? name.slice(index + marker.length) : name;
}

function toDocument(path: string, data: Record<string, unknown>): FirestoreDocument {
  return { name: documentName(path), fields: toFirestoreFields(data) };
}

function decodePath(encoded: string) {
  return encoded.split("/").map(decodeURIComponent).join("/");
}

function segmentCount(path: string) {
  return path.split("/").length;
}

function listCollection(store: StoreShape, collectionPath: string) {
  const depth = segmentCount(collectionPath) + 1;
  const prefix = `${collectionPath}/`;
  return Object.keys(store)
    .filter((path) => path.startsWith(prefix) && segmentCount(path) === depth)
    .sort();
}

interface FieldFilter {
  fieldFilter?: {
    field?: { fieldPath?: string };
    op?: string;
    value?: FirestoreValue;
  };
}

interface StructuredQuery {
  from?: Array<{ collectionId?: string; allDescendants?: boolean }>;
  where?: FieldFilter & { compositeFilter?: { op?: string; filters?: FieldFilter[] } };
  orderBy?: Array<{ field?: { fieldPath?: string }; direction?: string }>;
  limit?: number;
}

function filterValue(value: FirestoreValue | undefined): unknown {
  if (!value) return undefined;
  return fromFirestoreFields({ value }).value;
}

function compare(a: unknown, b: unknown) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function matchesFilter(data: Record<string, unknown>, filter: FieldFilter) {
  const field = filter.fieldFilter?.field?.fieldPath;
  if (!field) return true;
  const expected = filterValue(filter.fieldFilter?.value);
  const actual = data[field];
  switch (filter.fieldFilter?.op) {
    case "EQUAL": return actual === expected;
    case "GREATER_THAN_OR_EQUAL": return compare(actual, expected) >= 0;
    case "LESS_THAN_OR_EQUAL": return compare(actual, expected) <= 0;
    default: return true;
  }
}

function runQuery(store: StoreShape, query: StructuredQuery) {
  const collectionId = query.from?.[0]?.collectionId ?? "";
  const allDescendants = query.from?.[0]?.allDescendants === true;
  const filters: FieldFilter[] = query.where?.compositeFilter?.filters
    ?? (query.where?.fieldFilter ? [query.where] : []);

  let rows = Object.entries(store)
    .filter(([path]) => {
      if (!allDescendants) return segmentCount(path) === 2 && path.startsWith(`${collectionId}/`);
      return path.split("/").some((segment, index) => index % 2 === 0 && segment === collectionId);
    })
    .filter(([, data]) => filters.every((filter) => matchesFilter(data, filter)))
    .map(([path, data]) => ({ path, data }));

  const order = query.orderBy?.[0];
  if (order?.field?.fieldPath) {
    const field = order.field.fieldPath;
    const direction = order.direction === "DESCENDING" ? -1 : 1;
    rows = rows.sort((a, b) => direction * compare(a.data[field], b.data[field]));
  }
  if (query.limit) rows = rows.slice(0, query.limit);
  return rows;
}

function applyWrite(store: StoreShape, write: Record<string, unknown>) {
  if (typeof write.delete === "string") {
    delete store[pathFromName(write.delete)];
    return;
  }
  const update = write.update as { name?: string; fields?: Record<string, FirestoreValue> } | undefined;
  if (!update?.name) return;
  const path = pathFromName(update.name);
  const incoming = fromFirestoreFields(update.fields ?? {});
  const mask = (write.updateMask as { fieldPaths?: string[] } | undefined)?.fieldPaths;
  if (mask?.length) {
    const current = store[path] ?? {};
    for (const field of mask) current[field] = incoming[field];
    store[path] = current;
  } else {
    store[path] = incoming;
  }
}

export async function localFirestoreJson<T>(
  path: string,
  init: RequestInit = {},
  allowNotFound = false,
): Promise<T | null> {
  const store = load();
  const method = (init.method ?? "GET").toUpperCase();
  const body = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};

  if (path === "/documents:beginTransaction") {
    return { transaction: `local-${crypto.randomUUID()}` } as T;
  }
  if (path === "/documents:commit") {
    for (const write of (body.writes as Array<Record<string, unknown>> | undefined) ?? []) {
      applyWrite(store, write);
    }
    persist();
    return {} as T;
  }
  if (path === "/documents:runQuery") {
    const rows = runQuery(store, body.structuredQuery as StructuredQuery);
    return rows.map((row) => ({ document: toDocument(row.path, row.data) })) as T;
  }
  if (path === "/documents:runAggregationQuery") {
    const structured = (body.structuredAggregationQuery as { structuredQuery?: StructuredQuery } | undefined)?.structuredQuery;
    const rows = runQuery(store, structured ?? {});
    return [{ result: { aggregateFields: { total: { integerValue: String(rows.length) } } } }] as T;
  }

  const [rawPath, rawQuery] = path.replace(/^\/documents\//, "").split("?");
  const search = new URLSearchParams(rawQuery ?? "");
  const documentPath = decodePath(rawPath);

  if (method === "GET") {
    // Even segment counts address documents; odd counts address collections.
    if (segmentCount(documentPath) % 2 === 0) {
      const data = store[documentPath];
      if (!data) {
        if (allowNotFound) return null;
        throw new Error("Firestore request failed (404).");
      }
      return toDocument(documentPath, data) as T;
    }
    const pageSize = Number(search.get("pageSize") ?? 100);
    const paths = listCollection(store, documentPath).slice(0, pageSize);
    return { documents: paths.map((entry) => toDocument(entry, store[entry])) } as T;
  }

  if (method === "PATCH") {
    store[documentPath] = fromFirestoreFields((body.fields as Record<string, FirestoreValue>) ?? {});
    persist();
    return toDocument(documentPath, store[documentPath]) as T;
  }

  if (method === "POST") {
    const id = search.get("documentId") ?? crypto.randomUUID();
    const createdPath = `${documentPath}/${id}`;
    store[createdPath] = fromFirestoreFields((body.fields as Record<string, FirestoreValue>) ?? {});
    persist();
    return toDocument(createdPath, store[createdPath]) as T;
  }

  throw new Error(`Local store does not support ${method} ${path}.`);
}
