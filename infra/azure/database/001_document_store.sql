BEGIN;

CREATE TABLE IF NOT EXISTS filosage_documents (
  path text PRIMARY KEY,
  collection_id text NOT NULL,
  collection_path text NOT NULL,
  document_id text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT filosage_documents_path_shape CHECK (path <> '' AND path !~ '(^/|/$|//)'),
  CONSTRAINT filosage_documents_collection_shape CHECK (collection_id ~ '^[A-Za-z0-9_-]{1,80}$')
);

CREATE INDEX IF NOT EXISTS filosage_documents_collection_path_idx
  ON filosage_documents (collection_path, path);

CREATE INDEX IF NOT EXISTS filosage_documents_collection_id_idx
  ON filosage_documents (collection_id, path);

CREATE INDEX IF NOT EXISTS filosage_documents_data_gin_idx
  ON filosage_documents USING gin (data jsonb_path_ops);

COMMIT;
