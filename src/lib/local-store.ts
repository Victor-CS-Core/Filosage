import "server-only";

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  fromDocumentFields,
  toDocumentFields,
  type DocumentRecord,
  type DocumentValue,
} from "@/lib/document-values";

/**
 * A development-only stand-in for the document store, covering exactly the
 * request shapes document-store.ts issues: document get/list/patch/create,
 * runQuery (equality, AND composites, ranges, orderBy, limit),
 * runAggregationQuery (count), batchGet transactions, and commit. Documents live in
 * a JSON file so state survives dev-server restarts.
 */

const STORE_PATH = join(process.cwd(), process.env.FILOSAGE_LOCAL_DIR ?? ".filosage-local", "store.json");

type StoreShape = Record<string, Record<string, unknown>>;

function load(): StoreShape {
  // Next can bundle API routes into separate server module instances. Reloading
  // the development store for each operation prevents one route's stale
  // in-memory snapshot from hiding or overwriting a write made by another.
  try {
    return existsSync(STORE_PATH)
      ? JSON.parse(readFileSync(STORE_PATH, "utf8")) as StoreShape
      : {};
  } catch {
    return {};
  }
}

function persist(store: StoreShape) {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  const temporaryPath = `${STORE_PATH}.${process.pid}.${crypto.randomUUID()}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(store, null, 2));
  renameSync(temporaryPath, STORE_PATH);
}

async function mutateStore<T>(mutation: (store: StoreShape) => T): Promise<T> {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  const lockPath = `${STORE_PATH}.lock`;
  const deadline = Date.now() + 10_000;
  let lockDescriptor: number;
  while (true) {
    try {
      lockDescriptor = openSync(lockPath, "wx");
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  let result: T | undefined;
  let mutationError: unknown;
  let mutationFailed = false;
  try {
    const store = load();
    result = mutation(store);
    persist(store);
  } catch (error) {
    mutationFailed = true;
    mutationError = error;
  }

  let cleanupError: unknown;
  try {
    closeSync(lockDescriptor);
  } catch (error) {
    cleanupError = error;
  }
  try {
    unlinkSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" && cleanupError === undefined) {
      cleanupError = error;
    }
  }

  if (mutationFailed) throw mutationError;
  if (cleanupError !== undefined) throw cleanupError;
  return result as T;
}

function documentName(path: string) {
  return `projects/local/databases/(default)/documents/${path}`;
}

function pathFromName(name: string) {
  const marker = "/documents/";
  const index = name.indexOf(marker);
  return index >= 0 ? name.slice(index + marker.length) : name;
}

function toDocument(path: string, data: Record<string, unknown>): DocumentRecord {
  return { name: documentName(path), fields: toDocumentFields(data) };
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
    value?: DocumentValue;
  };
}

interface StructuredQuery {
  from?: Array<{ collectionId?: string; allDescendants?: boolean }>;
  where?: FieldFilter & { compositeFilter?: { op?: string; filters?: FieldFilter[] } };
  orderBy?: Array<{ field?: { fieldPath?: string }; direction?: string }>;
  startAt?: { values?: DocumentValue[]; before?: boolean };
  limit?: number;
}

function filterValue(value: DocumentValue | undefined): unknown {
  if (!value) return undefined;
  return fromDocumentFields({ value }).value;
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
    rows = rows.sort((a, b) => direction * (field === "__name__"
      ? (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
      : compare(a.data[field], b.data[field])));
  }
  if (query.startAt) {
    const values = query.startAt.values ?? [];
    const cursorName = filterValue(values[0]);
    const cursorPath = typeof cursorName === "string" ? pathFromName(cursorName) : "";
    if (
      order?.field?.fieldPath !== "__name__"
      || order.direction !== "ASCENDING"
      || query.startAt.before !== false
      || values.length !== 1
      || !cursorPath.startsWith(`${collectionId}/`)
      || segmentCount(cursorPath) !== 2
    ) {
      throw new Error("Local store received an unsupported document cursor.");
    }
    rows = rows.filter((row) => row.path > cursorPath);
  }
  if (query.limit) rows = rows.slice(0, query.limit);
  return rows;
}

function applyWrite(store: StoreShape, write: Record<string, unknown>) {
  if (typeof write.delete === "string") {
    delete store[pathFromName(write.delete)];
    return;
  }
  const update = write.update as { name?: string; fields?: Record<string, DocumentValue> } | undefined;
  if (!update?.name) return;
  const path = pathFromName(update.name);
  const incoming = fromDocumentFields(update.fields ?? {});
  const mask = (write.updateMask as { fieldPaths?: string[] } | undefined)?.fieldPaths;
  if (mask?.length) {
    const current = store[path] ?? {};
    for (const field of mask) current[field] = incoming[field];
    store[path] = current;
  } else {
    store[path] = incoming;
  }
}

export async function localDocumentStoreJson<T>(
  path: string,
  init: RequestInit = {},
  allowNotFound = false,
): Promise<T | null> {
  const method = (init.method ?? "GET").toUpperCase();
  const body = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};

  if (path === "/documents:beginTransaction") {
    return { transaction: `local-${crypto.randomUUID()}` } as T;
  }
  if (path === "/documents:batchGet") {
    const store = load();
    const transaction = `local-${crypto.randomUUID()}`;
    const documents = (body.documents as string[] | undefined) ?? [];
    return documents.map((name, index) => {
      const documentPath = pathFromName(name);
      const data = store[documentPath];
      return {
        ...(index === 0 ? { transaction } : {}),
        ...(data ? { found: toDocument(documentPath, data) } : { missing: name }),
      };
    }) as T;
  }
  if (path === "/documents:commit") {
    return mutateStore((store) => {
      for (const write of (body.writes as Array<Record<string, unknown>> | undefined) ?? []) {
        applyWrite(store, write);
      }
      return {} as T;
    });
  }
  if (path === "/documents:rollback") return {} as T;
  if (path === "/documents:runQuery") {
    const store = load();
    const rows = runQuery(store, body.structuredQuery as StructuredQuery);
    return rows.map((row) => ({ document: toDocument(row.path, row.data) })) as T;
  }
  if (path === "/documents:runAggregationQuery") {
    const store = load();
    const structured = (body.structuredAggregationQuery as { structuredQuery?: StructuredQuery } | undefined)?.structuredQuery;
    const rows = runQuery(store, structured ?? {});
    return [{ result: { aggregateFields: { total: { integerValue: String(rows.length) } } } }] as T;
  }

  const [rawPath, rawQuery] = path.replace(/^\/documents\//, "").split("?");
  const search = new URLSearchParams(rawQuery ?? "");
  const documentPath = decodePath(rawPath);

  if (method === "GET") {
    const store = load();
    // Even segment counts address documents; odd counts address collections.
    if (segmentCount(documentPath) % 2 === 0) {
      const data = store[documentPath];
      if (!data) {
        if (allowNotFound) return null;
        throw new Error("Document store request failed (404).");
      }
      return toDocument(documentPath, data) as T;
    }
    const pageSize = Number(search.get("pageSize") ?? 100);
    const paths = listCollection(store, documentPath).slice(0, pageSize);
    return { documents: paths.map((entry) => toDocument(entry, store[entry])) } as T;
  }

  if (method === "PATCH") {
    return mutateStore((store) => {
      const incoming = fromDocumentFields((body.fields as Record<string, DocumentValue>) ?? {});
      const masks = search.getAll("updateMask.fieldPaths");
      if (masks.length) {
        const current = { ...(store[documentPath] ?? {}) };
        for (const field of masks) current[field] = incoming[field];
        store[documentPath] = current;
      } else {
        store[documentPath] = incoming;
      }
      return toDocument(documentPath, store[documentPath]) as T;
    });
  }

  if (method === "POST") {
    return mutateStore((store) => {
      const id = search.get("documentId") ?? crypto.randomUUID();
      const createdPath = `${documentPath}/${id}`;
      store[createdPath] = fromDocumentFields((body.fields as Record<string, DocumentValue>) ?? {});
      return toDocument(createdPath, store[createdPath]) as T;
    });
  }

  throw new Error(`Local store does not support ${method} ${path}.`);
}
