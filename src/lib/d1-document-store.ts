import "server-only";

import {
  fromDocumentFields,
  fromDocumentValue,
  toDocumentFields,
  type DocumentRecord,
  type DocumentValue,
} from "@/lib/document-values";

/**
 * Cloudflare D1 document store backend.
 *
 * Implements the same Firestore-like JSON API as postgres-document-store.ts,
 * but against D1 (SQLite) instead of PostgreSQL. Key translations:
 *
 * - Placeholders: `?` instead of `$1`, `$2`, ...
 * - JSON access: `json_extract(data, '$.a.b.c')` instead of `data #> / #>>`
 * - Upsert: SQLite supports `ON CONFLICT DO UPDATE` natively
 * - Timestamps: `datetime('now')` instead of `now()`
 * - Transactions: D1 batches are atomic; interactive transactions with
 *   advisory locks are replaced by optimistic version checking. The
 *   transaction ID pattern is preserved for API compatibility, but locks
 *   are not acquired — writes use `WHERE version = ?` guards.
 *
 * The D1 database binding is resolved via the Cloudflare context. In local
 * development / tests without a binding, this module throws on first use.
 */

const DOCUMENT_NAME_PREFIX = "projects/cloudflare/databases/(default)/documents/";
const TRANSACTION_TTL_MS = 30_000;

interface DocumentRow {
  path: string;
  data: string;
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
  where?: FieldFilter & { compositeFilter?: { filters?: FieldFilter[] } };
  orderBy?: Array<{ field?: { fieldPath?: string }; direction?: string }>;
  startAt?: { values?: DocumentValue[]; before?: boolean };
  limit?: number;
}

interface ActiveTransaction {
  versions: Map<string, number>;
  timeout: ReturnType<typeof setTimeout>;
}

declare global {
  var __FILOSAGE_D1_TRANSACTIONS__: Map<string, ActiveTransaction> | undefined;
}

// ---------------------------------------------------------------------------
// D1 binding resolution
// ---------------------------------------------------------------------------

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta: { changes?: number } }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}

async function d1(): Promise<D1Database> {
  // OpenNext Cloudflare adapter exposes the Cloudflare context globally.
  const context = (globalThis as Record<string, unknown>)
    .__CLOUDFLARE_CONTEXT__ as { env?: Record<string, unknown> } | undefined;
  const fromContext = context?.env?.FILOSAGE_D1 as D1Database | undefined;
  if (fromContext) return fromContext;
  const viaHelper = await import("@/lib/cloudflare-context").then((m) => m.getD1Database()).catch(() => null);
  if (viaHelper) return viaHelper as D1Database;
  throw new Error("Cloudflare D1 database is not configured.");
}

// ---------------------------------------------------------------------------
// Helpers (mirroring postgres-document-store.ts)
// ---------------------------------------------------------------------------

function transactions() {
  globalThis.__FILOSAGE_D1_TRANSACTIONS__ ??= new Map();
  return globalThis.__FILOSAGE_D1_TRANSACTIONS__;
}

function validatePath(path: string) {
  const segments = path.split("/");
  if (!path || segments.some((segment) => !segment || segment.length > 1_500)) {
    throw new Error("Invalid document path.");
  }
  return segments;
}

function pathFromName(name: string) {
  const marker = "/documents/";
  const index = name.indexOf(marker);
  const path = index >= 0 ? name.slice(index + marker.length) : name;
  validatePath(path);
  return path;
}

function documentCoordinates(path: string) {
  const segments = validatePath(path);
  if (segments.length % 2 !== 0) throw new Error("A document path must end with a document ID.");
  return {
    collectionId: segments.at(-2) ?? "",
    collectionPath: segments.slice(0, -1).join("/"),
    documentId: segments.at(-1) ?? "",
  };
}

function toDocument(row: DocumentRow): DocumentRecord {
  return {
    name: `${DOCUMENT_NAME_PREFIX}${row.path}`,
    fields: toDocumentFields(JSON.parse(row.data) as Record<string, unknown>),
  };
}

function parseBody(init: RequestInit) {
  return typeof init.body === "string"
    ? JSON.parse(init.body) as Record<string, unknown>
    : {};
}

function documentData(fields: unknown) {
  return fromDocumentFields((fields ?? {}) as Record<string, DocumentValue>);
}

/** Convert a dot-separated field path to a SQLite JSON path, e.g. `a.b` -> `$.a.b`. */
function jsonPath(fieldPath: string) {
  return "$." + fieldPath.split(".").map((segment) => `"${segment.replace(/"/g, '""')}"`).join(".");
}

function filtersFrom(query: StructuredQuery) {
  return query.where?.compositeFilter?.filters
    ?? (query.where?.fieldFilter ? [query.where] : []);
}

function queryParts(query: StructuredQuery, countOnly = false) {
  const source = query.from?.[0];
  const collectionId = source?.collectionId;
  if (!collectionId || !/^[A-Za-z0-9_-]{1,80}$/.test(collectionId)) {
    throw new Error("Invalid document collection query.");
  }

  const parameters: unknown[] = [collectionId];
  const clauses = [source.allDescendants ? "collection_id = ?" : "collection_path = ?"];
  for (const filter of filtersFrom(query)) {
    const field = filter.fieldFilter?.field?.fieldPath;
    const operation = filter.fieldFilter?.op;
    if (!field || !/^[A-Za-z0-9_.-]{1,120}$/.test(field)) {
      throw new Error("Invalid document field query.");
    }
    const path = jsonPath(field);
    const expected = fromDocumentValue(filter.fieldFilter?.value ?? { nullValue: null });
    if (operation === "EQUAL") {
      // Compare as JSON for type-correct equality (numbers vs strings).
      clauses.push(`json_extract(data, '${path}') = json(?)`);
      parameters.push(JSON.stringify(expected));
    } else if (operation === "GREATER_THAN_OR_EQUAL") {
      clauses.push(`json_extract(data, '${path}') >= cast(? as text)`);
      parameters.push(String(expected ?? ""));
    } else if (operation === "LESS_THAN_OR_EQUAL") {
      clauses.push(`json_extract(data, '${path}') <= cast(? as text)`);
      parameters.push(String(expected ?? ""));
    } else {
      throw new Error(`Unsupported document query operation: ${operation ?? "unknown"}.`);
    }
  }

  if (query.startAt) {
    const orderBy = query.orderBy ?? [];
    const values = query.startAt.values ?? [];
    const cursorName = fromDocumentValue(values[0] ?? { nullValue: null });
    const cursorPath = typeof cursorName === "string" ? pathFromName(cursorName) : "";
    const cursorCoordinates = cursorPath ? documentCoordinates(cursorPath) : null;
    if (
      source.allDescendants
      || orderBy.length !== 1
      || orderBy[0]?.field?.fieldPath !== "__name__"
      || orderBy[0]?.direction !== "ASCENDING"
      || query.startAt.before !== false
      || values.length !== 1
      || cursorCoordinates?.collectionPath !== collectionId
    ) {
      throw new Error("D1 document store received an unsupported document cursor.");
    }
    parameters.push(cursorPath);
    clauses.push("path > ?");
  }

  let order = "path ASC";
  const orderBy = query.orderBy?.[0];
  const orderField = orderBy?.field?.fieldPath;
  if (orderField) {
    if (!/^[A-Za-z0-9_.-]{1,120}$/.test(orderField)) throw new Error("Invalid document ordering field.");
    const direction = orderBy.direction === "ASCENDING" ? "ASC" : "DESC";
    if (orderField === "__name__") {
      order = `path ${direction}`;
    } else {
      order = `json_extract(data, '${jsonPath(orderField)}') ${direction}, path ASC`;
    }
  }

  const boundedLimit = Math.min(Math.max(Number(query.limit ?? 1_000), 1), 10_000);
  if (!countOnly) parameters.push(boundedLimit);
  return {
    parameters,
    sql: `${clauses.join(" AND ")}${countOnly ? "" : ` ORDER BY ${order} LIMIT ?`}`,
  };
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

export async function checkD1DocumentStoreReadiness() {
  const db = await d1();
  const row = await db.prepare("SELECT 1 AS ready").first<{ ready: number }>();
  if (row?.ready !== 1) throw new Error("D1 readiness query failed.");
}

async function upsertDocument(
  db: D1Database,
  path: string,
  data: Record<string, unknown>,
  fieldMask?: string[],
  expectedVersion?: number,
) {
  const coordinates = documentCoordinates(path);
  if (fieldMask?.length) {
    const current = await db.prepare("SELECT path, data FROM filosage_documents WHERE path = ?")
      .bind(path).first<DocumentRow>();
    const next = { ...((current ? JSON.parse(current.data) : {}) as Record<string, unknown>) };
    for (const field of fieldMask) next[field] = data[field];
    data = next;
  }
  const payload = JSON.stringify(data);
  if (expectedVersion !== undefined) {
    // Optimistic concurrency: only write when the version still matches.
    const result = await db.prepare(
      `UPDATE filosage_documents
       SET data = ?, version = version + 1, updated_at = datetime('now')
       WHERE path = ? AND version = ?`,
    ).bind(payload, path, expectedVersion).run();
    if ((result.meta.changes ?? 0) === 0) {
      throw new Error("Document transaction conflict: the document changed before its update.");
    }
    const row = await db.prepare("SELECT path, data FROM filosage_documents WHERE path = ?")
      .bind(path).first<DocumentRow>();
    if (!row) throw new Error("D1 document store request failed (404).");
    return row;
  }
  const row = await db.prepare(
    `INSERT INTO filosage_documents
      (path, collection_id, collection_path, document_id, data)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (path) DO UPDATE SET
       data = excluded.data,
       version = filosage_documents.version + 1,
       updated_at = datetime('now')
     RETURNING path, data`,
  ).bind(path, coordinates.collectionId, coordinates.collectionPath, coordinates.documentId, payload)
    .first<DocumentRow>();
  if (!row) throw new Error("D1 document store upsert failed.");
  return row;
}

async function createDocument(db: D1Database, path: string, data: Record<string, unknown>) {
  const coordinates = documentCoordinates(path);
  const row = await db.prepare(
    `INSERT INTO filosage_documents
      (path, collection_id, collection_path, document_id, data)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (path) DO NOTHING
     RETURNING path, data`,
  ).bind(path, coordinates.collectionId, coordinates.collectionPath, coordinates.documentId, JSON.stringify(data))
    .first<DocumentRow>();
  if (!row) throw new Error("D1 document store request failed (409).");
  return row;
}

async function applyWrites(
  db: D1Database,
  writes: Array<Record<string, unknown>>,
  versions?: Map<string, number>,
) {
  // D1 batches are atomic: the whole batch commits or the whole batch rolls back.
  const statements: D1PreparedStatement[] = [];
  const versioned: Array<{ path: string; version: number }> = [];
  for (const write of writes) {
    if (typeof write.delete === "string") {
      const path = pathFromName(write.delete);
      statements.push(db.prepare("DELETE FROM filosage_documents WHERE path = ?").bind(path));
      continue;
    }
    const update = write.update as { name?: string; fields?: Record<string, DocumentValue> } | undefined;
    if (!update?.name) continue;
    const path = pathFromName(update.name);
    const mask = (write.updateMask as { fieldPaths?: string[] } | undefined)?.fieldPaths;
    const coordinates = documentCoordinates(path);
    // Resolve masked merge against the current row before batching.
    let data = documentData(update.fields);
    if (mask?.length) {
      const current = await db.prepare("SELECT data FROM filosage_documents WHERE path = ?")
        .bind(path).first<{ data: string }>();
      const next = { ...((current ? JSON.parse(current.data) : {}) as Record<string, unknown>) };
      for (const field of mask) next[field] = data[field];
      data = next;
    }
    const payload = JSON.stringify(data);
    const expectedVersion = versions?.get(path);
    if (expectedVersion !== undefined) {
      // Version-guarded update cannot run inside a blind batch; run it now.
      // The batch below stays atomic for the remaining writes.
      versioned.push({ path, version: expectedVersion });
      const result = await db.prepare(
        `UPDATE filosage_documents
         SET data = ?, version = version + 1, updated_at = datetime('now')
         WHERE path = ? AND version = ?`,
      ).bind(payload, path, expectedVersion).run();
      if ((result.meta.changes ?? 0) === 0) {
        throw new Error("Document transaction conflict: the document changed before its update.");
      }
      continue;
    }
    statements.push(db.prepare(
      `INSERT INTO filosage_documents
        (path, collection_id, collection_path, document_id, data)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (path) DO UPDATE SET
         data = excluded.data,
         version = filosage_documents.version + 1,
         updated_at = datetime('now')`,
    ).bind(path, coordinates.collectionId, coordinates.collectionPath, coordinates.documentId, payload));
  }
  if (statements.length) await db.batch(statements);
}

async function runStructuredQuery(query: StructuredQuery) {
  const db = await d1();
  const built = queryParts(query);
  const { results } = await db.prepare(
    `SELECT path, data FROM filosage_documents WHERE ${built.sql}`,
  ).bind(...built.parameters).all<DocumentRow>();
  return results.map((row) => ({ document: toDocument(row) }));
}

async function countStructuredQuery(query: StructuredQuery) {
  const db = await d1();
  const built = queryParts(query, true);
  const row = await db.prepare(
    `SELECT count(*) AS total FROM filosage_documents WHERE ${built.sql}`,
  ).bind(...built.parameters).first<{ total: number }>();
  return [{ result: { aggregateFields: { total: { integerValue: String(row?.total ?? 0) } } } }];
}

async function beginTransaction(documentNames: string[]) {
  const db = await d1();
  const id = crypto.randomUUID();
  const paths = [...new Set(documentNames.map(pathFromName))].sort();
  const versions = new Map<string, number>();
  const found = new Map<string, DocumentRow>();
  for (const path of paths) {
    const row = await db.prepare("SELECT path, data, version FROM filosage_documents WHERE path = ?")
      .bind(path).first<DocumentRow & { version: number }>();
    if (row) {
      versions.set(path, row.version);
      found.set(path, row);
    }
  }
  const timeout = setTimeout(() => {
    transactions().delete(id);
  }, TRANSACTION_TTL_MS);
  timeout.unref?.();
  transactions().set(id, { versions, timeout });
  return documentNames.map((name, index) => {
    const path = pathFromName(name);
    const row = found.get(path);
    return {
      ...(index === 0 ? { transaction: id } : {}),
      ...(row ? { found: toDocument(row) } : { missing: name }),
    };
  });
}

async function finishTransaction(id: string, writes: Array<Record<string, unknown>> | null) {
  const active = transactions().get(id);
  if (!active) throw new Error("Document transaction expired or does not exist.");
  transactions().delete(id);
  clearTimeout(active.timeout);
  if (!writes) return; // rollback: nothing was written yet under optimistic mode
  const db = await d1();
  // Re-read versions to detect conflicts before the atomic batch.
  for (const [path, version] of active.versions) {
    const row = await db.prepare("SELECT version FROM filosage_documents WHERE path = ?")
      .bind(path).first<{ version: number }>();
    if ((row?.version ?? -1) !== version) {
      throw new Error("Document transaction conflict: the document changed before its update.");
    }
  }
  await applyWrites(db, writes);
}

// ---------------------------------------------------------------------------
// Public JSON API (mirrors postgresDocumentStoreJson)
// ---------------------------------------------------------------------------

export async function d1DocumentStoreJson<T>(
  requestPath: string,
  init: RequestInit = {},
  allowNotFound = false,
): Promise<T | null> {
  const method = (init.method ?? "GET").toUpperCase();
  const body = parseBody(init);
  const db = await d1();

  if (requestPath === "/documents:scan") {
    const maximum = Math.min(Math.max(Number(body.maximum) || 50_000, 1), 100_000);
    const { results } = await db.prepare(
      "SELECT path, data FROM filosage_documents ORDER BY path ASC LIMIT ?",
    ).bind(maximum + 1).all<DocumentRow>();
    return {
      documents: results.slice(0, maximum).map(toDocument),
      complete: results.length <= maximum,
    } as T;
  }
  if (requestPath === "/documents:runQuery") {
    return await runStructuredQuery(body.structuredQuery as StructuredQuery) as T;
  }
  if (requestPath === "/documents:runAggregationQuery") {
    const aggregation = body.structuredAggregationQuery as { structuredQuery?: StructuredQuery } | undefined;
    return await countStructuredQuery(aggregation?.structuredQuery ?? {}) as T;
  }
  if (requestPath === "/documents:batchGet") {
    return await beginTransaction((body.documents as string[] | undefined) ?? []) as T;
  }
  if (requestPath === "/documents:commit") {
    const transaction = typeof body.transaction === "string" ? body.transaction : null;
    const writes = (body.writes as Array<Record<string, unknown>> | undefined) ?? [];
    if (transaction) await finishTransaction(transaction, writes);
    else await applyWrites(db, writes);
    return {} as T;
  }
  if (requestPath === "/documents:rollback") {
    if (typeof body.transaction === "string") await finishTransaction(body.transaction, null);
    return {} as T;
  }

  const [rawPath, rawQuery] = requestPath.replace(/^\/documents\//, "").split("?");
  const path = rawPath.split("/").map(decodeURIComponent).join("/");
  const search = new URLSearchParams(rawQuery ?? "");
  if (method === "GET" && validatePath(path).length % 2 === 0) {
    const row = await db.prepare("SELECT path, data FROM filosage_documents WHERE path = ?")
      .bind(path).first<DocumentRow>();
    if (!row) {
      if (allowNotFound) return null;
      throw new Error("D1 document store request failed (404).");
    }
    return toDocument(row) as T;
  }
  if (method === "GET") {
    const pageSize = Math.min(Math.max(Number(search.get("pageSize") ?? 100), 1), 300);
    const offset = Math.max(Number(search.get("pageToken") ?? 0), 0);
    const { results } = await db.prepare(
      `SELECT path, data FROM filosage_documents
       WHERE collection_path = ? ORDER BY path ASC LIMIT ? OFFSET ?`,
    ).bind(path, pageSize + 1, offset).all<DocumentRow>();
    const hasMore = results.length > pageSize;
    return {
      documents: results.slice(0, pageSize).map(toDocument),
      ...(hasMore ? { nextPageToken: String(offset + pageSize) } : {}),
    } as T;
  }
  if (method === "PATCH") {
    const masks = search.getAll("updateMask.fieldPaths");
    const row = await upsertDocument(db, path, documentData(body.fields), masks);
    return toDocument(row) as T;
  }
  if (method === "POST") {
    const docId = search.get("documentId") ?? crypto.randomUUID();
    const row = await createDocument(db, `${path}/${docId}`, documentData(body.fields));
    return toDocument(row) as T;
  }
  throw new Error(`D1 document store does not support ${method} ${requestPath}.`);
}
