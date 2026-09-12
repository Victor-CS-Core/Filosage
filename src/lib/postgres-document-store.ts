import "server-only";

import pg, { type PoolClient, type QueryResultRow } from "pg";
import {
  fromDocumentFields,
  fromDocumentValue,
  toDocumentFields,
  type DocumentRecord,
  type DocumentValue,
} from "@/lib/document-values";
import { serverEnvironment } from "@/lib/runtime-environment";

const { Pool } = pg;
const DOCUMENT_NAME_PREFIX = "projects/azure/databases/(default)/documents/";
const TRANSACTION_TTL_MS = 30_000;
const LOCK_TIMEOUT_MS = 10_000;
const STATEMENT_TIMEOUT_MS = 30_000;
const QUERY_RESPONSE_TIMEOUT_MS = 35_000;
const HEALTH_QUERY_TIMEOUT_MS = 3_000;

interface DocumentRow extends QueryResultRow {
  path: string;
  data: Record<string, unknown>;
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
  client: PoolClient;
  timeout: ReturnType<typeof setTimeout>;
}

declare global {
  var __FILOSAGE_POSTGRES_POOL__: pg.Pool | undefined;
  var __FILOSAGE_POSTGRES_HEALTH_POOL__: pg.Pool | undefined;
  var __FILOSAGE_POSTGRES_TRANSACTIONS__: Map<string, ActiveTransaction> | undefined;
}

function requiredDatabaseUrl() {
  const value = serverEnvironment.DATABASE_URL?.trim();
  if (!value) throw new Error("Azure PostgreSQL is not configured.");
  return value;
}

function databaseSsl() {
  const sslMode = serverEnvironment.DATABASE_SSL?.trim().toLowerCase()
    ?? (serverEnvironment.NODE_ENV === "production" ? "verify-full" : "disable");
  return sslMode === "disable" ? false : { rejectUnauthorized: sslMode !== "require" };
}

function databasePool() {
  if (!globalThis.__FILOSAGE_POSTGRES_POOL__) {
    globalThis.__FILOSAGE_POSTGRES_POOL__ = new Pool({
      connectionString: requiredDatabaseUrl(),
      max: Number(serverEnvironment.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // Server deadlines cover lock acquisition and mutation statements outside
      // the transaction-handle TTL. PostgreSQL disables statement_timeout before
      // deferred COMMIT work; the client deadline bounds that wait but its result
      // remains uncertain, so timeout cleanup must discard the connection.
      lock_timeout: LOCK_TIMEOUT_MS,
      statement_timeout: STATEMENT_TIMEOUT_MS,
      query_timeout: QUERY_RESPONSE_TIMEOUT_MS,
      ssl: databaseSsl(),
    });
  }
  return globalThis.__FILOSAGE_POSTGRES_POOL__;
}

function databaseHealthPool() {
  if (!globalThis.__FILOSAGE_POSTGRES_HEALTH_POOL__) {
    globalThis.__FILOSAGE_POSTGRES_HEALTH_POOL__ = new Pool({
      connectionString: requiredDatabaseUrl(),
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: HEALTH_QUERY_TIMEOUT_MS,
      query_timeout: HEALTH_QUERY_TIMEOUT_MS,
      statement_timeout: HEALTH_QUERY_TIMEOUT_MS,
      ssl: databaseSsl(),
    });
  }
  return globalThis.__FILOSAGE_POSTGRES_HEALTH_POOL__;
}

export async function checkPostgresDocumentStoreReadiness() {
  const result = await databaseHealthPool().query<{ ready: number }>("SELECT 1 AS ready");
  if (result.rows[0]?.ready !== 1) throw new Error("PostgreSQL readiness query failed.");
}

function transactions() {
  globalThis.__FILOSAGE_POSTGRES_TRANSACTIONS__ ??= new Map();
  return globalThis.__FILOSAGE_POSTGRES_TRANSACTIONS__;
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
    fields: toDocumentFields(row.data),
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

async function upsertDocument(
  client: Pick<PoolClient, "query">,
  path: string,
  data: Record<string, unknown>,
  fieldMask?: string[],
) {
  const coordinates = documentCoordinates(path);
  if (fieldMask?.length) {
    const current = await client.query<DocumentRow>(
      "SELECT path, data FROM filosage_documents WHERE path = $1",
      [path],
    );
    const next = { ...(current.rows[0]?.data ?? {}) };
    for (const field of fieldMask) next[field] = data[field];
    data = next;
  }
  const result = await client.query<DocumentRow>(
    `INSERT INTO filosage_documents
      (path, collection_id, collection_path, document_id, data)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (path) DO UPDATE SET
       data = EXCLUDED.data,
       version = filosage_documents.version + 1,
       updated_at = now()
     RETURNING path, data`,
    [path, coordinates.collectionId, coordinates.collectionPath, coordinates.documentId, JSON.stringify(data)],
  );
  return result.rows[0];
}

async function createDocument(
  client: Pick<PoolClient, "query">,
  path: string,
  data: Record<string, unknown>,
) {
  const coordinates = documentCoordinates(path);
  const result = await client.query<DocumentRow>(
    `INSERT INTO filosage_documents
      (path, collection_id, collection_path, document_id, data)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (path) DO NOTHING
     RETURNING path, data`,
    [path, coordinates.collectionId, coordinates.collectionPath, coordinates.documentId, JSON.stringify(data)],
  );
  if (!result.rows[0]) throw new Error("Azure document store request failed (409).");
  return result.rows[0];
}

async function applyWrites(client: PoolClient, writes: Array<Record<string, unknown>>) {
  for (const write of writes) {
    if (typeof write.delete === "string") {
      await client.query("DELETE FROM filosage_documents WHERE path = $1", [pathFromName(write.delete)]);
      continue;
    }
    const update = write.update as { name?: string; fields?: Record<string, DocumentValue> } | undefined;
    if (!update?.name) continue;
    const mask = (write.updateMask as { fieldPaths?: string[] } | undefined)?.fieldPaths;
    await upsertDocument(client, pathFromName(update.name), documentData(update.fields), mask);
  }
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
  const clauses = [source.allDescendants ? "collection_id = $1" : "collection_path = $1"];
  for (const filter of filtersFrom(query)) {
    const field = filter.fieldFilter?.field?.fieldPath;
    const operation = filter.fieldFilter?.op;
    if (!field || !/^[A-Za-z0-9_.-]{1,120}$/.test(field)) {
      throw new Error("Invalid document field query.");
    }
    const fieldPath = field.split(".");
    parameters.push(fieldPath);
    const fieldParameter = `$${parameters.length}::text[]`;
    const expected = fromDocumentValue(filter.fieldFilter?.value ?? { nullValue: null });
    parameters.push(expected);
    const valueParameter = `$${parameters.length}`;
    if (operation === "EQUAL") {
      clauses.push(`data #> ${fieldParameter} = ${valueParameter}::jsonb`);
      parameters[parameters.length - 1] = JSON.stringify(expected);
    } else if (operation === "GREATER_THAN_OR_EQUAL") {
      clauses.push(`data #>> ${fieldParameter} >= ${valueParameter}::text`);
    } else if (operation === "LESS_THAN_OR_EQUAL") {
      clauses.push(`data #>> ${fieldParameter} <= ${valueParameter}::text`);
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
      throw new Error("Azure document store received an unsupported document cursor.");
    }
    parameters.push(cursorPath);
    clauses.push(`path > $${parameters.length}`);
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
      parameters.push(orderField.split("."));
      order = `data #>> $${parameters.length}::text[] ${direction}, path ASC`;
    }
  }

  const boundedLimit = Math.min(Math.max(Number(query.limit ?? 1_000), 1), 10_000);
  if (!countOnly) parameters.push(boundedLimit);
  return {
    parameters,
    sql: `${clauses.join(" AND ")}${countOnly ? "" : ` ORDER BY ${order} LIMIT $${parameters.length}`}`,
  };
}

async function runStructuredQuery(query: StructuredQuery) {
  const built = queryParts(query);
  const result = await databasePool().query<DocumentRow>(
    `SELECT path, data FROM filosage_documents WHERE ${built.sql}`,
    built.parameters,
  );
  return result.rows.map((row) => ({ document: toDocument(row) }));
}

async function countStructuredQuery(query: StructuredQuery) {
  const built = queryParts(query, true);
  const result = await databasePool().query<{ total: string }>(
    `SELECT count(*)::text AS total FROM filosage_documents WHERE ${built.sql}`,
    built.parameters,
  );
  return [{ result: { aggregateFields: { total: { integerValue: result.rows[0]?.total ?? "0" } } } }];
}

async function rollbackAndRelease(client: PoolClient, cause?: unknown) {
  // pg's client read timeout does not cancel a non-pipelined server statement.
  // Never queue rollback or reuse that connection while its result is unknown.
  let discard = cause instanceof Error && cause.message === "Query read timeout";
  if (!discard) {
    try { await client.query("ROLLBACK"); }
    catch { discard = true; }
  }
  client.release(discard);
}

async function beginTransaction(documentNames: string[]) {
  const client = await databasePool().connect();
  const id = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    const paths = [...new Set(documentNames.map(pathFromName))].sort();
    for (const path of paths) {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [path]);
    }
    const result = paths.length
      ? await client.query<DocumentRow>(
        "SELECT path, data FROM filosage_documents WHERE path = ANY($1::text[]) FOR UPDATE",
        [paths],
      )
      : { rows: [] as DocumentRow[] };
    const found = new Map(result.rows.map((row) => [row.path, row]));
    const timeout = setTimeout(() => {
      const active = transactions().get(id);
      if (!active) return;
      transactions().delete(id);
      void rollbackAndRelease(active.client).catch(() => {
        console.error("Expired PostgreSQL transaction cleanup failed.");
      });
    }, TRANSACTION_TTL_MS);
    timeout.unref?.();
    transactions().set(id, { client, timeout });
    return documentNames.map((name, index) => {
      const path = pathFromName(name);
      const row = found.get(path);
      return {
        ...(index === 0 ? { transaction: id } : {}),
        ...(row ? { found: toDocument(row) } : { missing: name }),
      };
    });
  } catch (error) {
    await rollbackAndRelease(client, error);
    throw error;
  }
}

async function finishTransaction(id: string, writes: Array<Record<string, unknown>> | null) {
  const active = transactions().get(id);
  if (!active) throw new Error("Document transaction expired or does not exist.");
  transactions().delete(id);
  clearTimeout(active.timeout);
  try {
    if (writes) {
      await applyWrites(active.client, writes);
      await active.client.query("COMMIT");
    } else {
      await active.client.query("ROLLBACK");
    }
  } catch (error) {
    await rollbackAndRelease(active.client, error);
    throw error;
  }
  active.client.release();
}

async function commitWithoutExistingTransaction(writes: Array<Record<string, unknown>>) {
  const client = await databasePool().connect();
  try {
    await client.query("BEGIN");
    await applyWrites(client, writes);
    await client.query("COMMIT");
  } catch (error) {
    await rollbackAndRelease(client, error);
    throw error;
  }
  client.release();
}

export async function postgresDocumentStoreJson<T>(
  requestPath: string,
  init: RequestInit = {},
  allowNotFound = false,
): Promise<T | null> {
  const method = (init.method ?? "GET").toUpperCase();
  const body = parseBody(init);

  if (requestPath === "/documents:scan") {
    const maximum = Math.min(Math.max(Number(body.maximum) || 50_000, 1), 100_000);
    const rows = await databasePool().query<DocumentRow>("SELECT path, data FROM filosage_documents ORDER BY path ASC LIMIT $1", [maximum + 1]);
    return { documents: rows.rows.slice(0, maximum).map(toDocument), complete: rows.rows.length <= maximum } as T;
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
    else await commitWithoutExistingTransaction(writes);
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
    const result = await databasePool().query<DocumentRow>(
      "SELECT path, data FROM filosage_documents WHERE path = $1",
      [path],
    );
    if (!result.rows[0]) {
      if (allowNotFound) return null;
      throw new Error("Azure document store request failed (404).");
    }
    return toDocument(result.rows[0]) as T;
  }
  if (method === "GET") {
    const pageSize = Math.min(Math.max(Number(search.get("pageSize") ?? 100), 1), 300);
    const offset = Math.max(Number(search.get("pageToken") ?? 0), 0);
    const result = await databasePool().query<DocumentRow>(
      `SELECT path, data FROM filosage_documents
       WHERE collection_path = $1 ORDER BY path ASC LIMIT $2 OFFSET $3`,
      [path, pageSize + 1, offset],
    );
    const hasMore = result.rows.length > pageSize;
    return {
      documents: result.rows.slice(0, pageSize).map(toDocument),
      ...(hasMore ? { nextPageToken: String(offset + pageSize) } : {}),
    } as T;
  }
  if (method === "PATCH") {
    const masks = search.getAll("updateMask.fieldPaths");
    const row = await upsertDocument(databasePool(), path, documentData(body.fields), masks);
    return toDocument(row) as T;
  }
  if (method === "POST") {
    const id = search.get("documentId") ?? crypto.randomUUID();
    const row = await createDocument(databasePool(), `${path}/${id}`, documentData(body.fields));
    return toDocument(row) as T;
  }
  throw new Error(`Azure document store does not support ${method} ${requestPath}.`);
}
