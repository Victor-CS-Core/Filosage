-- FiloSage document store schema for Cloudflare D1 (SQLite).
--
-- Port of infra/azure/database/001_document_store.sql. Differences from the
-- PostgreSQL original:
-- - `data` is TEXT holding a JSON document (SQLite has no jsonb type, but the
--   JSON1 extension provides json_extract / json() used by d1-document-store.ts)
-- - `timestamptz` -> TEXT storing ISO-8601 UTC (written as datetime('now'))
-- - `version` optimistic-concurrency counter is read by the D1 backend
-- - No CHECK constraints on path shape beyond NOT NULL (validated in code)

CREATE TABLE IF NOT EXISTS filosage_documents (
  path TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  collection_path TEXT NOT NULL,
  document_id TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS filosage_documents_collection_path_idx
  ON filosage_documents (collection_path, path);

CREATE INDEX IF NOT EXISTS filosage_documents_collection_id_idx
  ON filosage_documents (collection_id, path);
