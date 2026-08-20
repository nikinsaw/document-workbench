-- Multi-Document Intelligence Workbench — SQLite schema
--
-- Written to be trivially portable to Postgres later:
--   - TEXT primary keys (UUIDs) instead of AUTOINCREMENT INTEGER
--   - ISO-8601 strings for timestamps (Postgres: swap to TIMESTAMPTZ)
--   - JSON stored as TEXT (Postgres: swap to JSONB)
--   - No SQLite-specific pragmas relied upon in application logic

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS documents (
  document_id     TEXT PRIMARY KEY,
  file_name       TEXT NOT NULL,
  file_type       TEXT NOT NULL CHECK (file_type IN ('pdf', 'csv', 'txt', 'image')),
  status          TEXT NOT NULL CHECK (status IN ('pending', 'parsed', 'failed')) DEFAULT 'pending',
  size_bytes      INTEGER NOT NULL,
  stored_path     TEXT NOT NULL,
  uploaded_at     TEXT NOT NULL,
  error_message   TEXT,
  extracted_text  TEXT,
  extracted_rows  TEXT, -- JSON array of row objects, CSV only
  metadata        TEXT  -- JSON blob: DocumentMetadata
);

CREATE TABLE IF NOT EXISTS analyses (
  analysis_id     TEXT PRIMARY KEY,
  prompt          TEXT NOT NULL,
  document_ids    TEXT NOT NULL, -- JSON array of document_id strings
  created_at      TEXT NOT NULL,
  per_document    TEXT NOT NULL, -- JSON: PerDocumentAnalysis[]
  synthesis       TEXT NOT NULL, -- JSON: CrossDocumentSynthesis
  any_truncated   INTEGER NOT NULL DEFAULT 0
);

-- Findings are also normalized into their own table so that
-- "which analyses reference document X" queries don't require
-- deserializing JSON blobs. The JSON copies above remain the
-- source of truth for exact reconstruction of the API response;
-- this table exists for indexing/joins.
CREATE TABLE IF NOT EXISTS findings (
  finding_id            TEXT PRIMARY KEY,
  analysis_id           TEXT NOT NULL REFERENCES analyses(analysis_id) ON DELETE CASCADE,
  scope                 TEXT NOT NULL CHECK (scope IN ('per_document', 'synthesis')),
  source_document_ids   TEXT NOT NULL, -- JSON array
  category              TEXT NOT NULL,
  title                 TEXT NOT NULL,
  extracted_facts       TEXT NOT NULL, -- JSON array of strings
  ai_interpretation      TEXT NOT NULL,
  confidence            TEXT
);

CREATE INDEX IF NOT EXISTS idx_findings_analysis_id ON findings(analysis_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
